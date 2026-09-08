import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const ref = 'utwlmwjuisvensqxuuve'
const url = process.env.STAGING_SUPABASE_URL
const secret = process.env.STAGING_SUPABASE_SERVICE_KEY
const publishable = process.env.STAGING_SUPABASE_PUBLISHABLE_KEY
const password = process.env.STAGING_QA_PASSWORD
if (!url || new URL(url).host !== `${ref}.supabase.co` || !secret || !publishable || !password) throw new Error('Missing staging-only QA configuration.')
if (process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production') throw new Error('Refusing to run against a production runtime.')

const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } })
const anonymous = createClient(url, publishable, { auth: { autoRefreshToken: false, persistSession: false } })
const suffix = '20260815@qa.bsmile.local'
const emails = {
  director: `director-${suffix}`,
  psychologist: `psychologist-${suffix}`,
  intern: `intern-denied-${suffix}`,
}
const pass = (name) => results.push(`${name}: PASS`)
const deny = (name, error) => {
  if (!error) throw new Error(`${name}: expected denial`)
  results.push(`${name}: DENIED`)
}
const results = []

const { data: users, error: usersError } = await admin.auth.admin.listUsers({ perPage: 1000 })
if (usersError) throw usersError
const userByEmail = (email) => {
  const user = users.users.find((candidate) => candidate.email === email)
  if (!user) throw new Error(`Missing QA account ${email}`)
  return user
}
const identities = Object.fromEntries(Object.entries(emails).map(([key, email]) => [key, userByEmail(email)]))
for (const user of Object.values(identities)) {
  const { error } = await admin.auth.admin.updateUserById(user.id, { password })
  if (error) throw error
}
const signIn = async (email) => {
  const client = createClient(url, publishable, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}
const psychologist = await signIn(emails.psychologist)
const unrelatedIntern = await signIn(emails.intern)
const now = Date.now()
const patientA = {
  patient_number: `FINAL-QA-PDOC-A-${now}`,
  full_name: `FINAL-QA Patient A ${now}`,
  assigned_psychologist_id: identities.psychologist.id,
  created_by: identities.director.id,
}
const patientB = {
  patient_number: `FINAL-QA-PDOC-B-${now}`,
  full_name: `FINAL-QA Patient B ${now}`,
  assigned_psychologist_id: identities.director.id,
  created_by: identities.director.id,
}
const { data: createdA, error: patientAError } = await admin.from('patients').insert(patientA).select('id').single()
if (patientAError) throw patientAError
const { data: createdB, error: patientBError } = await admin.from('patients').insert(patientB).select('id').single()
if (patientBError) throw patientBError

const documentRow = (patientId, id, storageKey, uploadedBy = identities.psychologist.id) => ({
  id,
  patient_id: patientId,
  document_name: 'FINAL-QA patient document',
  original_filename: 'final-qa.pdf',
  category: 'qa',
  storage_key: storageKey,
  mime_type: 'application/pdf',
  file_extension: 'pdf',
  file_size_bytes: 16,
  uploaded_by: uploadedBy,
})
const keyFor = (patientId, documentId) => `patients/${patientId}/documents/${documentId}/v1/${randomUUID()}.pdf`
const documentId = randomUUID()
const authorizedKey = keyFor(createdA.id, documentId)
const bytes = new Blob(['FINAL-QA-PDF-BYTES'], { type: 'application/pdf' })

const permissionCheck = await psychologist.rpc('has_permission', { permission_code: 'patient_documents.upload' })
const patientAccessCheck = await psychologist.rpc('patient_access', { patient: createdA.id })
if (permissionCheck.error || patientAccessCheck.error || !permissionCheck.data || !patientAccessCheck.data) {
  throw new Error(`Authorized uploader prerequisites failed: permission=${Boolean(permissionCheck.data)} patient_access=${Boolean(patientAccessCheck.data)}`)
}

const upload = await psychologist.storage.from('patient-documents').upload(authorizedKey, bytes, { contentType: 'application/pdf' })
if (upload.error) throw upload.error
pass('storage authorized canonical upload')

const authorizedRow = await psychologist.from('patient_documents').insert(documentRow(createdA.id, documentId, authorizedKey))
if (authorizedRow.error) throw authorizedRow.error
pass('table authorized insert')

const authorizedRead = await psychologist.storage.from('patient-documents').download(authorizedKey)
if (authorizedRead.error || !authorizedRead.data) throw authorizedRead.error ?? new Error('No authorized document data')
pass('storage authorized read')

const forged = await psychologist.from('patient_documents').insert(documentRow(createdA.id, randomUUID(), keyFor(createdA.id, randomUUID()), identities.director.id))
deny('table forged uploaded_by', forged.error)

const inaccessibleDocumentId = randomUUID()
const inaccessibleKey = keyFor(createdB.id, inaccessibleDocumentId)
const inaccessibleTable = await psychologist.from('patient_documents').insert(documentRow(createdB.id, inaccessibleDocumentId, inaccessibleKey))
deny('table unauthorized patient', inaccessibleTable.error)

const arbitrary = await psychologist.storage.from('patient-documents').upload(`random-folder/${randomUUID()}.pdf`, bytes, { contentType: 'application/pdf' })
deny('storage arbitrary path', arbitrary.error)

const otherPatient = await psychologist.storage.from('patient-documents').upload(inaccessibleKey, bytes, { contentType: 'application/pdf' })
deny('storage unauthorized patient path', otherPatient.error)

const anonymousDocumentId = randomUUID()
const anonymousKey = keyFor(createdA.id, anonymousDocumentId)
const anonymousUpload = await anonymous.storage.from('patient-documents').upload(anonymousKey, bytes, { contentType: 'application/pdf' })
deny('storage anonymous upload', anonymousUpload.error)
const anonymousTable = await anonymous.from('patient_documents').insert(documentRow(createdA.id, anonymousDocumentId, anonymousKey))
deny('table anonymous insert', anonymousTable.error)
const anonymousRead = await anonymous.storage.from('patient-documents').download(authorizedKey)
deny('storage anonymous read', anonymousRead.error)

const unrelatedRead = await unrelatedIntern.storage.from('patient-documents').download(authorizedKey)
deny('storage unrelated user read', unrelatedRead.error)
const unrelatedUpdate = await unrelatedIntern.from('patient_documents').update({ document_name: 'forged change' }).eq('id', documentId).select('id')
if (unrelatedUpdate.error || !unrelatedUpdate.data?.length) {
  results.push('table unrelated user update: DENIED')
} else {
  throw new Error('table unrelated user update: expected denial')
}
const unrelatedDelete = await unrelatedIntern.storage.from('patient-documents').remove([authorizedKey])
deny('storage unrelated user delete', unrelatedDelete.error)

console.log(JSON.stringify({ patients: [createdA.id, createdB.id], documentId, results }))


