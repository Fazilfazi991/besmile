import { supabase } from "./supabase";
import { dateKey } from "./attendance-rules";
import {
  hasLeaveOverlap,
  hasSufficientBalance,
  leaveDays,
} from "./leave-rules";
import { crmRecordUnavailableMessage } from "./crm-access-errors";
import { documentFileValidationMessage } from "./document-file-rules";
import { taskStatuses, type TaskStatus } from "./task-rules";
import { operationalEmployeeStatuses } from "./employee-status";
import { attendanceRpcError } from "./attendance-geofence";
import { isChatMessageActive } from "./chat-message-state";
const db = supabase as any;
const required = () => {
  if (!db) throw new Error("Supabase is not configured.");
  return db;
};
export const employeeRepository = {
  async hasPermission(permissionCode: string) {
    const { data, error } = await required().rpc("has_permission", {
      permission_code: permissionCode,
    });
    if (error) throw error;
    return !!data;
  },
  async grantedPermissions(permissionCodes: readonly string[]) {
    const r = required();
    const { data, error } = await r.rpc("granted_permissions", {
      permission_codes: [...permissionCodes],
    });
    if (
      error &&
      (error.code === "PGRST202" ||
        /granted_permissions|schema cache|could not find/i.test(error.message || ""))
    ) {
      const checks = await Promise.all(
        permissionCodes.map((code) => this.hasPermission(code)),
      );
      return new Set(permissionCodes.filter((_, index) => checks[index]));
    }
    if (error) throw error;
    return new Set((data || []) as string[]);
  },
  async dashboard(userId: string) {
    const r = required();
    const { data: settings, error: settingsError } = await r
      .from("company_attendance_settings")
      .select("timezone")
      .single();
    if (settingsError) throw settingsError;
    const [attendance, tasks, leaves, notifications] = await Promise.all([
      r
        .from("attendance")
        .select("*")
        .eq("profile_id", userId)
        .eq("work_date", dateKey(new Date(), settings.timezone))
        .maybeSingle(),
      r.from("tasks").select("*").eq("assignee_id", userId).order("due_date"),
      r
        .from("leave_requests")
        .select("*")
        .eq("profile_id", userId)
        .order("created_at", { ascending: false })
        .limit(5),
      r
        .from("notifications")
        .select("*")
        .eq("profile_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    for (const x of [attendance, tasks, leaves, notifications])
      if (x.error) throw x.error;
    return {
      attendance: attendance.data,
      tasks: tasks.data,
      leaves: leaves.data,
      notifications: notifications.data,
    };
  },
  async crmLookups() {
    const r = required();
    const [sources, statuses] = await Promise.all([
      r
        .from("crm_lead_sources")
        .select("*")
        .eq("is_active", true)
        .order("name"),
      r
        .from("crm_lead_statuses")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
    ]);
    if (sources.error) throw sources.error;
    if (statuses.error) throw statuses.error;
    return { sources: sources.data, statuses: statuses.data };
  },
  async myCrmLeads(_userId: string, filters: any = {}) {
    const r = required();
    let q = r
      .from("crm_leads")
      .select(
        "*,source:crm_lead_sources(name),status:crm_lead_statuses(name),crm_lead_followups(*)",
      )
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (filters.query)
      q = q.or(
        `full_name.ilike.%${filters.query}%,phone.ilike.%${filters.query}%`,
      );
    if (filters.status_id) q = q.eq("status_id", filters.status_id);
    if (filters.source_id) q = q.eq("source_id", filters.source_id);
    if (filters.temperature) q = q.eq("temperature", filters.temperature);
    if (filters.profession)
      q = q.ilike("profession", `%${filters.profession}%`);
    if (filters.location) q = q.ilike("location", `%${filters.location}%`);
    if (filters.date) q = q.eq("lead_date", filters.date);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  },
  async myCrmLead(_userId: string, id: string) {
    const { data, error } = await required()
      .from("crm_leads")
      .select(
        "*,source:crm_lead_sources(name),status:crm_lead_statuses(name),assignee:profiles!crm_leads_assigned_to_fkey(full_name),crm_lead_followups(*,profiles(full_name)),crm_sales(*)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error)
      throw new Error("CRM data could not be loaded. Please try again.");
    if (!data) throw new Error(crmRecordUnavailableMessage);
    return data;
  },
  async myCrmFollowups(_userId: string) {
    const { data, error } = await required()
      .from("crm_lead_followups")
      .select(
        "*,crm_leads!inner(id,full_name,phone,assigned_to,status:crm_lead_statuses(name))",
      )
      .order("next_follow_up_at", { ascending: true });
    if (error) throw error;
    return data;
  },
  async myCrmSales(userId: string) {
    const { data, error } = await required()
      .from("crm_sales")
      .select("*,crm_leads!inner(id,full_name,phone,assigned_to)")
      .eq("crm_leads.assigned_to", userId)
      .order("closing_date", { ascending: false });
    if (error) throw error;
    return data;
  },
  async createMyCrmLead(payload: any) {
    const { data, error } = await required()
      .from("crm_leads")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateMyCrmLead(userId: string, id: string, patch: any) {
    const { data, error } = await required()
      .from("crm_leads")
      .update(patch)
      .eq("id", id)
      .eq("assigned_to", userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async addMyCrmFollowup(userId: string, payload: any, allowDuplicate = false) {
    if (
      !Number.isInteger(payload.followup_number) ||
      payload.followup_number < 1
    )
      throw new Error("Choose a valid follow-up number.");
    const r = required();
    const { data: existing, error: existingError } = await r
      .from("crm_lead_followups")
      .select("id")
      .eq("lead_id", payload.lead_id)
      .eq("followup_number", payload.followup_number)
      .limit(1);
    if (existingError) throw existingError;
    if (existing?.length && !allowDuplicate)
      throw new Error("This follow-up number already exists.");
    const { data, error } = await r
      .from("crm_lead_followups")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateMyCrmFollowup(userId: string, id: string, patch: any) {
    const r = required();
    if (patch.followup_number !== undefined) {
      if (!Number.isInteger(patch.followup_number) || patch.followup_number < 1)
        throw new Error("Choose a valid follow-up number.");
      const current = await r
        .from("crm_lead_followups")
        .select("lead_id")
        .eq("id", id)
        .single();
      if (current.error) throw current.error;
      const duplicate = await r
        .from("crm_lead_followups")
        .select("id")
        .eq("lead_id", current.data.lead_id)
        .eq("followup_number", patch.followup_number)
        .neq("id", id)
        .limit(1);
      if (duplicate.error) throw duplicate.error;
      if (duplicate.data?.length)
        throw new Error("This follow-up number already exists for this lead.");
    }
    const { data, error } = await r
      .from("crm_lead_followups")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async convertMyCrmLead(userId: string, payload: any) {
    const r = required();
    const lead = await this.myCrmLead(userId, payload.lead_id);
    if (!lead) throw new Error("Lead not found.");
    const { data, error } = await r
      .from("crm_sales")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    const update = await r
      .from("crm_leads")
      .update({ converted_at: new Date().toISOString() })
      .eq("id", payload.lead_id)
      .eq("assigned_to", userId);
    if (update.error) throw update.error;
    return data;
  },
  async clockIn(
    _userId: string,
    location: { latitude: number; longitude: number; accuracy: number },
  ) {
    const { data, error } = await required().rpc(
      "record_self_attendance_location",
      {
        p_action: "clock_in",
        p_latitude: location.latitude,
        p_longitude: location.longitude,
        p_accuracy_metres: location.accuracy,
      },
    );
    if (error) {
      if (error.code === "23505")
        throw new Error("You have already clocked in today.");
      throw new Error(attendanceRpcError(error.message));
    }
    return data;
  },
  async clockOut(
    _id: string,
    location: { latitude: number; longitude: number; accuracy: number },
  ) {
    const { data, error } = await required().rpc(
      "record_self_attendance_location",
      {
        p_action: "clock_out",
        p_latitude: location.latitude,
        p_longitude: location.longitude,
        p_accuracy_metres: location.accuracy,
      },
    );
    if (error) throw new Error(attendanceRpcError(error.message));
    return data;
  },
  async startBreak(attendanceId: string) {
    const { data, error } = await required()
      .from("attendance_breaks")
      .insert({ attendance_id: attendanceId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async endBreak(id: string) {
    const r = required();
    const { data, error } = await r
      .from("attendance_breaks")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", id)
      .is("ended_at", null)
      .select("attendance_id")
      .single();
    if (error) throw error;
    const minutes = await completedBreakMinutes(data.attendance_id);
    const update = await r
      .from("attendance")
      .update({ break_minutes: minutes })
      .eq("id", data.attendance_id);
    if (update.error) throw update.error;
    return data;
  },
  async attendanceToday(userId: string) {
    const r = required();
    const { data: settings, error: settingsError } = await r
      .from("company_attendance_settings")
      .select("timezone")
      .single();
    if (settingsError) throw settingsError;
    const workDate = dateKey(new Date(), settings.timezone);
    const { data, error } = await r
      .from("attendance")
      .select("*,attendance_breaks(*)")
      .eq("profile_id", userId)
      .eq("work_date", workDate)
      .maybeSingle();
    if (error) throw error;
    return { workDate, attendance: data };
  },
  async teamAttendanceToday() {
    const r = required();
    const { data: settings, error: settingsError } = await r
      .from("company_attendance_settings")
      .select("timezone")
      .single();
    if (settingsError) throw settingsError;
    const workDate = dateKey(new Date(), settings.timezone);
    const [peopleResult, attendanceResult, leaveResult] = await Promise.all([
      r
        .from("profiles")
        .select(
          "id,full_name,designation,avatar_url,department:departments(name)",
        )
        .eq("is_employee", true)
        .eq("workforce_visible", true)
        .neq("role", "director")
        .eq("status", "active")
        .order("full_name"),
      r
        .from("attendance")
        .select(
          "id,profile_id,clock_in,clock_out,status,break_minutes,attendance_breaks(started_at,ended_at)",
        )
        .eq("work_date", workDate),
      r
        .from("leave_requests")
        .select("profile_id")
        .eq("status", "approved")
        .lte("starts_on", workDate)
        .gte("ends_on", workDate),
    ]);
    if (peopleResult.error) throw peopleResult.error;
    const people = [
      ...new Map(
        (peopleResult.data || []).map((person: any) => [person.id, person]),
      ).values(),
    ];
    const attendanceByProfile = new Map(
      (attendanceResult.error ? [] : attendanceResult.data || []).map(
        (row: any) => [row.profile_id, row],
      ),
    );
    const onLeave = new Set(
      (leaveResult.error ? [] : leaveResult.data || []).map(
        (row: any) => row.profile_id,
      ),
    );
    const photoPaths = people
      .map((person: any) => person.avatar_url)
      .filter(Boolean);
    const signedPhotos = new Map<string, string>();
    if (photoPaths.length) {
      const { data, error } = await r.storage
        .from("profile-photos")
        .createSignedUrls(photoPaths, 300);
      if (!error)
        (data || []).forEach((photo: any) => {
          if (photo.path && photo.signedUrl)
            signedPhotos.set(photo.path, photo.signedUrl);
        });
    }
    return {
      workDate,
      employees: people.map((person: any) => ({
        ...person,
        photo_url: person.avatar_url
          ? signedPhotos.get(person.avatar_url) || null
          : null,
        attendance: attendanceByProfile.get(person.id) || null,
        on_leave: onLeave.has(person.id),
      })),
    };
  },
  async companyAttendance(workDate: string) {
    const r = required();
    const [peopleResult, attendanceResult, leaveResult] = await Promise.all([
      r
        .from("profiles")
        .select(
          "id,full_name,employee_code,designation,department:departments(name)",
        )
        .eq("is_employee", true)
        .eq("workforce_visible", true)
        .neq("role", "director")
        .in("status", operationalEmployeeStatuses)
        .order("full_name"),
      r
        .from("attendance")
        .select(
          "id,profile_id,work_date,clock_in,clock_out,status,break_minutes,clock_in_location_verified,clock_in_distance_metres,clock_out_location_verified,clock_out_distance_metres",
        )
        .eq("work_date", workDate),
      r
        .from("leave_requests")
        .select("profile_id")
        .eq("status", "approved")
        .lte("starts_on", workDate)
        .gte("ends_on", workDate),
    ]);
    for (const result of [peopleResult, attendanceResult, leaveResult])
      if (result.error) throw result.error;
    const byProfile = new Map(
      (attendanceResult.data || []).map((row: any) => [row.profile_id, row]),
    );
    const onLeave = new Set(
      (leaveResult.data || []).map((row: any) => row.profile_id),
    );
    return (peopleResult.data || []).map((person: any) => ({
      ...person,
      attendance: byProfile.get(person.id) || null,
      on_leave: onLeave.has(person.id),
    }));
  },
  async attendanceHistory(userId: string) {
    const { data, error } = await required()
      .from("attendance")
      .select("*,attendance_breaks(*)")
      .eq("profile_id", userId)
      .order("work_date", { ascending: false })
      .limit(31);
    if (error) throw error;
    return data;
  },
  async attendanceRules(userId: string, from: string, to: string) {
    const r = required();
    const [settings, holidays, attendance, leaves, awareness] =
      await Promise.all([
        r.from("company_attendance_settings").select("*").single(),
        r
          .from("holidays")
          .select("*")
          .eq("is_active", true)
          .gte("holiday_date", from)
          .lte("holiday_date", to),
        r
          .from("attendance")
          .select("*,attendance_breaks(*)")
          .eq("profile_id", userId)
          .gte("work_date", from)
          .lte("work_date", to),
        r
          .from("leave_requests")
          .select("*")
          .eq("profile_id", userId)
          .eq("status", "approved")
          .lte("starts_on", to)
          .gte("ends_on", from),
        r
          .from("awareness_events")
          .select("name,recurrence_rule,notes,is_active")
          .eq("is_active", true),
      ]);
    for (const x of [settings, holidays, attendance, leaves, awareness])
      if (x.error) throw x.error;
    return {
      settings: settings.data,
      holidays: holidays.data,
      attendance: attendance.data,
      leaves: leaves.data,
      awareness: awareness.data,
    };
  },
  async myTasks(userId: string) {
    const r = required();
    const { data: assignments, error: assignmentError } = await r
      .from("task_assignments")
      .select("id,task_id,profile_id,status,updated_at")
      .eq("profile_id", userId)
      .order("updated_at", { ascending: false });
    if (assignmentError)
      throw new Error("Tasks could not be loaded. Please try again.");
    const ids = assignments.map((item: any) => item.task_id);
    if (!ids.length) return [];
    const [
      { data: tasks, error: taskError },
      { data: comments, error: commentError },
    ] = await Promise.all([
      r.from("tasks").select("*").in("id", ids),
      r
        .from("task_comments")
        .select("id,task_id,author_id,body,created_at")
        .in("task_id", ids)
        .order("created_at"),
    ]);
    if (taskError || commentError)
      throw new Error("Tasks could not be loaded. Please try again.");
    const profileIds = [
      ...new Set([
        ...(tasks || []).map((task: any) => task.created_by).filter(Boolean),
        ...(comments || [])
          .map((comment: any) => comment.author_id)
          .filter(Boolean),
      ]),
    ];
    const { data: people, error: peopleError } = profileIds.length
      ? await r.from("profiles").select("id,full_name").in("id", profileIds)
      : { data: [], error: null };
    if (peopleError)
      throw new Error("Tasks could not be loaded. Please try again.");
    const names = new Map(
      (people || []).map((person: any) => [person.id, person]),
    );
    const taskMap = new Map(
      (tasks || []).map((task: any) => [
        task.id,
        {
          ...task,
          created_by_profile: names.get(task.created_by) || null,
          task_comments: (comments || [])
            .filter((comment: any) => comment.task_id === task.id)
            .map((comment: any) => ({
              ...comment,
              author_profile: names.get(comment.author_id) || null,
            })),
        },
      ]),
    );
    return assignments
      .map((assignment: any) => ({
        ...assignment,
        tasks: taskMap.get(assignment.task_id),
      }))
      .filter((item: any) => item.tasks);
  },
  async updateMyTask(
    assignmentId: string,
    status: TaskStatus,
    comment: string,
    userId: string,
  ) {
    if (!taskStatuses.includes(status))
      throw new Error("Choose a valid task status.");
    const r = required();
    const { data, error } = await r
      .from("task_assignments")
      .update({ status })
      .eq("id", assignmentId)
      .eq("profile_id", userId)
      .select("task_id,status,updated_at")
      .single();
    if (error) throw error;
    if (comment.trim()) {
      const insert = await r.from("task_comments").insert({
        task_id: data.task_id,
        author_id: userId,
        body: comment.trim(),
      });
      if (insert.error) throw insert.error;
    }
    return data;
  },
  async announcements(userId: string) {
    const { data, error } = await required()
      .from("announcements")
      .select(
        "*,author:profiles!announcements_author_id_fkey(full_name),announcement_reads!left(read_at,profile_id)",
      )
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("is_pinned", { ascending: false })
      .order("published_at", { ascending: false });
    if (error) throw error;
    return data.map((item: any) => ({
      ...item,
      is_read: item.announcement_reads?.some(
        (read: any) => read.profile_id === userId,
      ),
    }));
  },
  async announcement(id: string, userId: string) {
    const { data, error } = await required()
      .from("announcements")
      .select(
        "*,author:profiles!announcements_author_id_fkey(full_name),announcement_reads!left(read_at,profile_id)",
      )
      .eq("id", id)
      .eq("status", "published")
      .lte("published_at", new Date().toISOString())
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .single();
    if (error) throw error;
    return {
      ...data,
      is_read: data.announcement_reads?.some(
        (read: any) => read.profile_id === userId,
      ),
    };
  },
  async markAnnouncementRead(announcementId: string, userId: string) {
    const { error } = await required().from("announcement_reads").upsert(
      {
        announcement_id: announcementId,
        profile_id: userId,
        read_at: new Date().toISOString(),
      },
      { onConflict: "announcement_id,profile_id" },
    );
    if (error) throw error;
  },
  async notifications(userId: string, page = 0, size = 20) {
    const { data, error } = await required()
      .from("notifications")
      .select("*")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false })
      .range(page * size, page * size + size - 1);
    if (error) throw error;
    return data;
  },
  async notificationPreferences(userId: string) {
    const { data, error } = await required()
      .from("notification_preferences")
      .select("*")
      .eq("profile_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  async saveNotificationPreferences(
    userId: string,
    preferences: Record<string, unknown>,
  ) {
    const { error } = await required()
      .from("notification_preferences")
      .upsert(
        { profile_id: userId, ...preferences },
        { onConflict: "profile_id" },
      );
    if (error) throw error;
  },
  async markNotificationRead(id: string, userId: string) {
    const { error } = await required()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("profile_id", userId);
    if (error) throw error;
  },
  async markAllNotificationsRead(userId: string) {
    const { error } = await required()
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("profile_id", userId)
      .is("read_at", null);
    if (error) throw error;
  },
  async profile(userId: string) {
    const r = required();
    const { data, error } = await r
      .from("profiles")
      .select("*,department:departments(name)")
      .eq("id", userId)
      .single();
    if (error) throw error;
    let manager = null;
    if (data.manager_id) {
      const result = await r
        .from("profiles")
        .select("full_name")
        .eq("id", data.manager_id)
        .maybeSingle();
      if (result.error) throw result.error;
      manager = result.data;
    }
    return { ...data, manager };
  },
  async updateMyProfile(userId: string, patch: any) {
    const allowed = [
      "full_name",
      "phone",
      "personal_email",
      "date_of_birth",
      "gender",
      "address",
      "emergency_contact",
      "bank_details",
      "avatar_url",
    ];
    const safe = Object.fromEntries(
      Object.entries(patch).filter(([key]) => allowed.includes(key)),
    );
    const { data, error } = await required()
      .from("profiles")
      .update(safe)
      .eq("id", userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async uploadProfilePhoto(userId: string, file: File) {
    if (!file.type.startsWith("image/"))
      throw new Error("Choose an image file.");
    if (file.size > 5 * 1024 * 1024)
      throw new Error("Profile photo must be 5 MB or smaller.");
    const path = `${userId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await required()
      .storage.from("profile-photos")
      .upload(path, file);
    if (error) throw error;
    await this.updateMyProfile(userId, { avatar_url: path });
    return path;
  },
  async removeProfilePhoto(userId: string, path: string) {
    const r = required();
    const removal = await r.storage.from("profile-photos").remove([path]);
    if (removal.error) throw removal.error;
    await this.updateMyProfile(userId, { avatar_url: null });
  },
  async signedProfilePhoto(path: string) {
    const { data, error } = await required()
      .storage.from("profile-photos")
      .createSignedUrl(path, 300);
    if (error) throw error;
    return data.signedUrl;
  },
  async conversations(userId: string) {
    const r = required();
    const ensured = await r.rpc("ensure_my_all_employees_chat");
    if (
      ensured.error &&
      ensured.error.code !== "PGRST202" &&
      !/ensure_my_all_employees_chat|schema cache|could not find/i.test(
        ensured.error.message || "",
      )
    )
      throw ensured.error;
    const summary = await r.rpc("chat_conversation_summaries");
    if (!summary.error) return summary.data || [];
    if (
      summary.error.code !== "PGRST202" &&
      !/chat_conversation_summaries|schema cache|could not find/i.test(
        summary.error.message || "",
      )
    )
      throw summary.error;
    const { data, error } = await r
      .from("chat_members")
      .select(
        "conversation_id,last_read_at,last_read_message_id,chat_conversations(*,chat_members(profile_id,last_read_at,last_read_message_id,profiles(full_name,email,designation,department:departments(name),avatar_url,status)) )",
      )
      .eq("profile_id", userId)
      .order("last_read_at", { ascending: false });
    if (error) throw error;
    const conversationIds = (data || []).map(
      (item: any) => item.conversation_id,
    );
    let messages = conversationIds.length
      ? await r
          .from("chat_messages")
          .select(
            "id,conversation_id,body,message_type,voice_duration_seconds,attachment_name,created_at,sender_id,deleted_at,expires_at,expired_at",
          )
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false })
      : { data: [], error: null };
    if (messages.error && /voice_duration_seconds|column/i.test(messages.error.message || "")) {
      messages = await r.from("chat_messages").select("id,conversation_id,body,message_type,attachment_name,created_at,sender_id,deleted_at,expires_at,expired_at").in("conversation_id", conversationIds).order("created_at", { ascending: false });
    }
    if (messages.error) throw messages.error;
    const { data: mentionRows, error: mentionError } = await r
      .from("chat_message_mentions")
      .select("conversation_id,message:chat_messages(created_at,deleted_at,expires_at,expired_at)")
      .eq("profile_id", userId);
    if (mentionError) throw mentionError;
    return (data || [])
      .map((item: any) => {
        const latest = (messages.data || []).find(
          (message: any) => message.conversation_id === item.conversation_id && isChatMessageActive(message),
        );
        const unread = (messages.data || []).filter(
          (message: any) =>
            message.conversation_id === item.conversation_id &&
            message.sender_id !== userId && isChatMessageActive(message) &&
            (!item.last_read_at ||
              new Date(message.created_at) > new Date(item.last_read_at)),
        ).length;
        const mentions = (mentionRows || []).filter((mention: any) =>
          mention.conversation_id === item.conversation_id &&
          mention.message && isChatMessageActive(mention.message) &&
          (!item.last_read_at || new Date(mention.message?.created_at) > new Date(item.last_read_at)),
        ).length;
        return {
          ...item,
          latest_message: latest || null,
          unread_count: unread,
          mention_count: mentions,
        };
      })
      .sort(
        (a: any, b: any) =>
          Number(b.chat_conversations?.is_system_group) -
            Number(a.chat_conversations?.is_system_group) ||
          Number(b.chat_conversations?.conversation_type === "group") -
            Number(a.chat_conversations?.conversation_type === "group") ||
          new Date(b.latest_message?.created_at || 0).getTime() -
            new Date(a.latest_message?.created_at || 0).getTime(),
      );
  },
  async chatMessages(conversationId: string) {
    const { data, error } = await required()
      .from("chat_messages")
      .select("*,sender:profiles!chat_messages_sender_id_fkey(full_name)")
      .eq("conversation_id", conversationId)
      .order("created_at");
    if (error) throw error;
    return data;
  },
  async chatMessagePage(conversationId: string, before?: string, size = 50) {
    let request = required()
      .from("chat_messages")
      .select(
        "id,conversation_id,sender_id,body,message_type,attachment_path,attachment_name,attachment_type,attachment_size,voice_duration_seconds,client_message_id,created_at,reply_to_message_id,edited_at,deleted_at,deleted_by,expires_at,expired_at,sender:profiles!chat_messages_sender_id_fkey(full_name),reactions:chat_message_reactions(profile_id,emoji),mentions:chat_message_mentions(profile_id,profiles(full_name))",
      )
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(size);
    if (before) request = request.lt("created_at", before);
    const { data, error } = await request;
    if (error) throw error;
    const rows = (data || []).reverse();
    const parentIds = [...new Set(rows.map((message: any) => message.reply_to_message_id).filter(Boolean))];
    if (!parentIds.length) return { data: rows, hasMore: rows.length === size };
    const { data: parents, error: parentError } = await required()
      .from("chat_messages")
      .select("id,body,message_type,attachment_name,deleted_at,expires_at,expired_at,sender:profiles!chat_messages_sender_id_fkey(full_name)")
      .in("id", parentIds);
    if (parentError) return { data: rows, hasMore: rows.length === size };
    const parentsById = new Map((parents || []).map((parent: any) => [parent.id, parent]));
    return {
      data: rows.map((message: any) => ({ ...message, reply_to: parentsById.get(message.reply_to_message_id) || null })),
      hasMore: rows.length === size,
    };
  },
  async sendMessage(payload: {
    conversation_id: string;
    channel_id?: string;
    sender_id: string;
    body: string;
    client_message_id: string;
    file?: File | null;
    voice_duration_seconds?: number;
    reply_to_message_id?: string | null;
    mention_profile_ids?: string[];
  }) {
    const r = required();
    const { file, mention_profile_ids = [], ...message } = payload;
    if (!message.conversation_id || !message.channel_id)
      throw new Error(
        "Message could not be sent because the conversation was not ready. Please reopen the chat and try again.",
      );
    let attachment: any = {};
    let uploadedPath = "";
    if (file) {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("Attachments must be 10 MB or smaller.");
      const voice = message.voice_duration_seconds !== undefined;
      const allowed = voice
        ? /^audio\//
        : /^(image\/|application\/pdf|application\/(msword|vnd\.openxmlformats-officedocument|vnd\.ms-excel|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet))/;
      if (!allowed.test(file.type))
        throw new Error(
          voice
            ? "This browser produced an unsupported voice recording."
            : "Only images, PDF, Word, and Excel files are supported.",
        );
      uploadedPath = `${message.sender_id}/${message.conversation_id}/${crypto.randomUUID()}-${file.name}`;
      const upload = await r.storage
        .from("chat-attachments")
        .upload(uploadedPath, file, { contentType: file.type });
      if (upload.error) throw upload.error;
      attachment = {
        message_type: voice ? "voice" : "attachment",
        attachment_path: uploadedPath,
        attachment_name: file.name,
        attachment_type: file.type,
        attachment_size: file.size,
      };
    }
    const { data, error } = await r
      .from("chat_messages")
      .insert({ ...message, ...attachment, body: message.body || "" })
      .select()
      .single();
    if (error) {
      if (uploadedPath)
        await r.storage.from("chat-attachments").remove([uploadedPath]);
      throw error;
    }
    if (mention_profile_ids.length) {
      const mentionSync = await r.rpc("sync_chat_message_mentions", {
        target_message: data.id,
        target_conversation: message.conversation_id,
        target_profiles: mention_profile_ids,
      });
      if (mentionSync.error) throw mentionSync.error;
    }
    return data;
  },
  async chatAttachmentUrl(path: string) {
    const { data: message, error: messageError } = await required()
      .from("chat_messages")
      .select("id")
      .eq("attachment_path", path)
      .is("expired_at", null)
      .is("deleted_at", null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .maybeSingle();
    if (messageError) throw messageError;
    if (!message) throw new Error("This attachment is no longer available.");
    const { data, error } = await required()
      .storage.from("chat-attachments")
      .createSignedUrl(path, 120);
    if (error) throw error;
    return data.signedUrl;
  },
  async markConversationRead(conversationId: string, _userId: string, messageId?: string) {
    const { error } = await required().rpc("mark_chat_conversation_read", {
      target_conversation: conversationId,
      target_message: messageId || null,
    });
    if (error) throw error;
  },
  async chatPeople(query = "") {
    const { data, error } = await required().rpc('chat_recipient_search', { search_text: query.trim() });
    if (error) throw error;
    return (data || []).map((person: any) => ({ ...person, department: person.department_name ? { name: person.department_name } : null }));
  },
  async toggleChatReaction(messageId: string, emoji: string) {
    const db = required();
    const { data: message, error: messageError } = await db.from('chat_messages').select('id,deleted_at,expires_at,expired_at').eq('id', messageId).maybeSingle();
    if (messageError) throw messageError;
    if (!message || !isChatMessageActive(message)) throw new Error('This message is no longer available for reactions.');
    const { data: existing, error: findError } = await db.from('chat_message_reactions').select('message_id').eq('message_id', messageId).eq('emoji', emoji).maybeSingle();
    if (findError) throw findError;
    const result = existing ? await db.from('chat_message_reactions').delete().eq('message_id', messageId).eq('emoji', emoji) : await db.from('chat_message_reactions').insert({ message_id: messageId, profile_id: (await db.auth.getUser()).data.user?.id, emoji });
    if (result.error) throw result.error; return !existing;
  },
  async editChatMessage(messageId: string, body: string, mentionProfileIds: string[] = []) {
    const { data, error } = await required().rpc("edit_chat_message", {
      target_message: messageId,
      next_body: body,
      mention_profiles: mentionProfileIds,
    });
    if (error) throw error;
    return data;
  },
  async deleteChatMessage(messageId: string) {
    const { data, error } = await required().rpc("delete_chat_message", {
      target_message: messageId,
    });
    if (error) throw error;
    return data;
  },
  async setChatDisappearingMessages(conversationId: string, seconds: number) {
    const { error } = await required().rpc("set_chat_disappearing_messages", {
      target_conversation: conversationId,
      retention_seconds: seconds,
    });
    if (error) throw error;
  },
  async createPersonalChat(_userId: string, otherId: string) {
    const { data, error } = await required().rpc("create_or_get_direct_chat", {
      other_profile: otherId,
    });
    if (error) throw error;
    return data;
  },
  async createGroupChat(
    _userId: string,
    title: string,
    memberIds: string[],
    description = "",
    type = "general",
  ) {
    const { data, error } = await required().rpc("create_group_chat", {
      chat_title: title,
      chat_description: description,
      chat_type: type,
      member_ids: memberIds,
    });
    if (error) throw error;
    return data;
  },
  async manageChatMember(
    conversationId: string,
    profileId: string,
    operation: "add" | "remove",
  ) {
    const { error } = await required().rpc("manage_group_chat_member", {
      conversation: conversationId,
      member: profileId,
      operation,
    });
    if (error) throw error;
  },
  async leaveTypes() {
    const { data, error } = await required()
      .from("leave_types")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return data;
  },
  async leaveBalances(userId: string, year = new Date().getFullYear()) {
    const { data, error } = await required()
      .from("employee_leave_balances")
      .select("*,leave_types(*)")
      .eq("profile_id", userId)
      .eq("leave_year", year);
    if (error) throw error;
    return data;
  },
  async leaveCalendar(from: string, to: string) {
    const r = required();
    const [settings, holidays] = await Promise.all([
      r.from("company_attendance_settings").select("working_days").single(),
      r
        .from("holidays")
        .select("holiday_date")
        .gte("holiday_date", from)
        .lte("holiday_date", to),
    ]);
    if (settings.error) throw settings.error;
    if (holidays.error) throw holidays.error;
    return {
      workingDays: settings.data.working_days as number[],
      holidays: new Set<string>(
        holidays.data.map((h: any) => String(h.holiday_date)),
      ),
    };
  },
  async leaveHistory(userId: string) {
    const { data, error } = await required()
      .from("leave_requests")
        .select("*,leave_types(*),leave_request_attachments(*),leave_approval_events(event_type,comment,created_at)")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async leaveDetail(id: string) {
    const { data, error } = await required()
      .from("leave_requests")
      .select(
        "*,leave_types(*),leave_request_attachments(*),leave_approval_events(*)",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
  async requestLeave(payload: {
    profile_id: string;
    leave_type_id: string;
    starts_on: string;
    ends_on: string;
    reason: string;
    half_day: boolean;
  }) {
    const r = required();
    const [calendar, history, balances, types] = await Promise.all([
      this.leaveCalendar(payload.starts_on, payload.ends_on),
      this.leaveHistory(payload.profile_id),
      this.leaveBalances(
        payload.profile_id,
        Number(payload.starts_on.slice(0, 4)),
      ),
      this.leaveTypes(),
    ]);
    const requested_days = leaveDays(
      payload.starts_on,
      payload.ends_on,
      calendar.workingDays,
      calendar.holidays,
      payload.half_day,
    );
    if (hasLeaveOverlap(payload, history))
      throw new Error("These dates overlap an existing active leave request.");
    const type = types.find((x: any) => x.id === payload.leave_type_id);
    if (!type)
      throw new Error(
        "The selected leave type no longer exists. Please choose another type.",
      );
    const balance = balances.find((x: any) => x.leave_type_id === type.id);
    if (
      type.balance_required &&
      balance &&
      !hasSufficientBalance(
        Number(balance.allocated_days),
        Number(balance.used_days),
        requested_days,
      )
    )
      throw new Error(
        `Your available ${type.name} balance is insufficient for this request.`,
      );
    const { data, error } = await r
      .from("leave_requests")
      .insert({
        ...payload,
        leave_type: type.code,
        requested_days,
        status: "pending",
      })
      .select()
      .single();
    if (error)
      throw new Error(error.message || "Failed to insert leave request.");
    const event = await r.from("leave_approval_events").insert({
      leave_request_id: data.id,
      actor_id: payload.profile_id,
      event_type: "created",
    });
    if (event.error)
      console.warn(
        "Leave request was created, but its audit event could not be recorded.",
        event.error,
      );
    return data;
  },
  async cancelLeave(
    id: string,
    status: "cancelled" | "withdrawn" = "cancelled",
  ) {
    const field = status === "cancelled" ? "cancelled_at" : "withdrawn_at";
    const { data, error } = await required()
      .from("leave_requests")
      .update({ status, [field]: new Date().toISOString() })
      .eq("id", id)
      .in("status", ["pending", "approved"])
      .select()
      .single();
    if (error) throw error;
    const event = await required().from("leave_approval_events").insert({
      leave_request_id: id,
      actor_id: data.profile_id,
      event_type: status,
    });
    if (event.error) throw event.error;
    return data;
  },
  async uploadLeaveAttachment(userId: string, file: File) {
    const path = `${userId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await required()
      .storage.from("leave-attachments")
      .upload(path, file);
    if (error) throw error;
    return { path, fileName: file.name, contentType: file.type };
  },
  async attachLeaveFile(
    leaveRequestId: string,
    file: { path: string; fileName: string; contentType: string },
  ) {
    const { data, error } = await required()
      .from("leave_request_attachments")
      .insert({
        leave_request_id: leaveRequestId,
        storage_path: file.path,
        file_name: file.fileName,
        content_type: file.contentType,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async signedLeaveAttachmentUrl(path: string) {
    const { data, error } = await required()
      .storage.from("leave-attachments")
      .createSignedUrl(path, 60);
    if (error) throw error;
    return data.signedUrl;
  },
  async signedDocumentUrl(path: string) {
    const { data, error } = await required()
      .storage.from("employee-documents")
      .createSignedUrl(path, 60);
    if (error) throw error;
    return data.signedUrl;
  },
  async companyDocuments() {
    const { data, error } = await required()
      .from("documents")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async documentRequests(userId: string) {
    const { data, error } = await required()
      .from("document_requests")
      .select("*,document_submissions(*)")
      .eq("profile_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async submitRequestedDocument(userId: string, requestId: string, file: File) {
    const fileError = documentFileValidationMessage(file);
    if (fileError) throw Error(fileError);
    const r = required();
    const existing = await r
      .from("document_requests")
      .select("status,document_submissions(storage_path)")
      .eq("id", requestId)
      .eq("profile_id", userId)
      .single();
    if (existing.error) throw existing.error;
    const previousStatus = existing.data?.status || "requested";
    const previousPath = existing.data?.document_submissions?.[0]?.storage_path || null;
    const path = `${userId}/requests/${requestId}-${crypto.randomUUID()}-${file.name}`;
    let uploaded = false,
      updated = false;
    try {
      const upload = await r.storage
        .from("employee-documents")
        .upload(path, file);
      if (upload.error) throw upload.error;
      uploaded = true;
      const request = await r
        .from("document_requests")
        .update({ status: "submitted" })
        .eq("id", requestId)
        .eq("profile_id", userId)
        .select()
        .single();
      if (request.error) throw request.error;
      updated = true;
      const submission = await r.from("document_submissions").upsert(
        {
          request_id: requestId,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || null,
          file_size: file.size,
          submitted_by: userId,
          submitted_at: new Date().toISOString(),
        },
        { onConflict: "request_id" },
      );
      if (submission.error) throw submission.error;
      if (previousPath && previousPath !== path)
        await r.storage.from("employee-documents").remove([previousPath]);
      return path;
    } catch (error) {
      if (uploaded) await r.storage.from("employee-documents").remove([path]);
      if (updated)
        await r
          .from("document_requests")
          .update({ status: previousStatus })
          .eq("id", requestId)
          .eq("profile_id", userId);
      throw error;
    }
  },
  async uploadDocument(userId: string, file: File) {
    const fileError = documentFileValidationMessage(file);
    if (fileError) throw Error(fileError);
    const path = `${userId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await required()
      .storage.from("employee-documents")
      .upload(path, file);
    if (error) throw error;
    return path;
  },
};
async function completedBreakMinutes(attendanceId: string) {
  const { data, error } = await required()
    .from("attendance_breaks")
    .select("started_at,ended_at")
    .eq("attendance_id", attendanceId)
    .not("ended_at", "is", null);
  if (error) throw error;
  return data.reduce(
    (sum: any, item: any) =>
      sum +
      Math.max(
        0,
        Math.round(
          (new Date(item.ended_at).getTime() -
            new Date(item.started_at).getTime()) /
            60000,
        ),
      ),
    0,
  );
}
