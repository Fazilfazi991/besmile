import {
  AlarmClock, BadgeDollarSign, Banknote, Bell, BriefcaseBusiness, CalendarCheck, CalendarClock,
  CalendarDays, CalendarHeart, CalendarRange, ChartNoAxesCombined, CheckCheck, CircleDollarSign, Clock3,
  ChevronRight, CirclePlus, ClipboardCheck, ClipboardList, ContactRound, Database, FileChartColumn,
  FileText, FileUp, FolderOpen, Gauge, Grid3X3, HandCoins, Handshake, HeartHandshake, Landmark,
  LayoutDashboard, Lightbulb, ListChecks, Megaphone, MessageSquareHeart, MessagesSquare,
  MessageCircleMore, PanelsTopLeft, PhoneCall, RadioTower, ReceiptText, Search, Settings, ShieldCheck,
  SlidersHorizontal, Tags, Target, TrendingDown, Upload, UserCheck, UserCog, UserRound,
  UserRoundCheck, UserRoundSearch, UsersRound, Video, WalletCards, Workflow, type LucideIcon,
} from 'lucide-react';
import { iconNameForLabel } from '@/lib/module-icon-map';

type ModuleIconProps = { label: string; className?: string };

const ICONS: Record<string, LucideIcon> = {
  AlarmClock, BadgeDollarSign, Banknote, Bell, BriefcaseBusiness, CalendarCheck, CalendarClock,
  CalendarDays, CalendarHeart, CalendarRange, ChartNoAxesCombined, CheckCheck, CircleDollarSign,
  ChevronRight, CirclePlus, ClipboardCheck, ClipboardList, Clock3, ContactRound, Database, FileChartColumn,
  FileText, FileUp, FolderOpen, Gauge, Grid3X3, HandCoins, Handshake, HeartHandshake, Landmark,
  LayoutDashboard, Lightbulb, ListChecks, Megaphone, MessageCircleMore, MessageSquareHeart, MessagesSquare,
  PhoneCall, RadioTower, ReceiptText, Search, Settings, ShieldCheck, SlidersHorizontal,
  Tags, Target, TrendingDown, Upload, UserCheck, UserCog, UserRound, UserRoundCheck,
  UserRoundSearch, UsersRound, Video, WalletCards, Workflow,
};

export function ModuleIcon({ label, className = '' }: ModuleIconProps) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const Icon = ICONS[iconNameForLabel(label)] ?? PanelsTopLeft;
  return (
    <span className={`module-icon module-${slug}${className ? ` ${className}` : ''}`} aria-hidden="true">
      <Icon aria-hidden="true" focusable="false" strokeWidth={2} />
    </span>
  );
}
