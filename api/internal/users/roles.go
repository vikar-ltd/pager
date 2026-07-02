package users

// Role is the coarse permission tier attached to every user record.
//
//   root   — full admin plus user management (create/delete anyone, change roles)
//   admin  — read-write on data; can create and delete viewers, but not admins or root
//   viewer — read-only
type Role string

const (
	RoleRoot   Role = "root"
	RoleAdmin  Role = "admin"
	RoleViewer Role = "viewer"
)

func (r Role) Valid() bool {
	switch r {
	case RoleRoot, RoleAdmin, RoleViewer:
		return true
	}
	return false
}

// CanWrite is true for roles that may mutate application data
// (properties, goals). Viewers get read-only access.
func (r Role) CanWrite() bool { return r == RoleRoot || r == RoleAdmin }

// CanManageUsers is true for roles that may see the users list and manage
// user accounts. What they can *do* within that page is further constrained
// by CanCreate / CanDelete / CanChangeRole per target role.
func (r Role) CanManageUsers() bool { return r == RoleRoot || r == RoleAdmin }

// CanCreate reports whether an actor of role `r` may create a user with `target` role.
// - root  can create any role
// - admin can create viewers only
// - viewer can create nobody
func (r Role) CanCreate(target Role) bool {
	switch r {
	case RoleRoot:
		return target.Valid()
	case RoleAdmin:
		return target == RoleViewer
	default:
		return false
	}
}

// CanDelete reports whether an actor of role `r` may delete a user with `target` role.
// - root  can delete anyone
// - admin can delete viewers only
// - viewer can delete nobody
func (r Role) CanDelete(target Role) bool { return r.CanCreate(target) }

// CanChangeRole reports whether the actor may modify roles. Only root may.
func (r Role) CanChangeRole() bool { return r == RoleRoot }
