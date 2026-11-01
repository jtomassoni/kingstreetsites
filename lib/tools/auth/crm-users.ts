/**
 * CRM access === super admin. Kept for existing imports.
 */
export {
  isSuperAdmin as isCrmUser,
  isSuperAdmin,
  superAdminEmails as getCrmEmails,
  getSuperAdminUsers as getCrmAuthUsers,
} from "@/lib/tools/auth/roles";
