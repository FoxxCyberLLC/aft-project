// Seeder script to create one user per role with default credentials
// Run with: bun scripts/seed-users.ts (or via package.json script)

import { sql, UserRole, waitForReady } from "../lib/database-bun";

async function main() {
  await waitForReady();

  const defaultPassword = "password123";
  const hashedPassword = await Bun.password.hash(defaultPassword, {
    algorithm: "bcrypt",
    cost: 12
  });

  type SeedUser = {
    role: (typeof UserRole)[keyof typeof UserRole];
    email: string;
    firstName: string;
    lastName: string;
    organization: string;
    phone: string;
  };

  const users: SeedUser[] = [
    { role: UserRole.ADMIN,           email: "admin@aft.gov",     firstName: "System",  lastName: "Administrator", organization: "AFT HQ",          phone: "555-0100" },
    { role: UserRole.REQUESTOR,       email: "requestor@aft.gov", firstName: "Renee",   lastName: "Requestor",     organization: "AFT Org",         phone: "555-0101" },
    { role: UserRole.DAO,             email: "dao@aft.gov",       firstName: "Derek",   lastName: "DAO",           organization: "AFT Org",         phone: "555-0102" },
    { role: UserRole.APPROVER,        email: "approver@aft.gov",  firstName: "Iris",    lastName: "ISSM",          organization: "AFT Security",    phone: "555-0103" },
    { role: UserRole.CPSO,            email: "cpso@aft.gov",      firstName: "Casey",   lastName: "CPSO",          organization: "AFT Contractor",  phone: "555-0104" },
    { role: UserRole.DTA,             email: "dta@aft.gov",       firstName: "Dana",    lastName: "DTA",           organization: "AFT Transfer",    phone: "555-0105" },
    { role: UserRole.SME,             email: "sme@aft.gov",       firstName: "Sam",     lastName: "SME",           organization: "AFT Engineering", phone: "555-0106" },
    { role: UserRole.MEDIA_CUSTODIAN, email: "custodian@aft.gov", firstName: "Mia",     lastName: "Custodian",     organization: "AFT Media",       phone: "555-0107" }
  ];

  let created = 0;
  let updated = 0;
  let rolesAttached = 0;

  for (const u of users) {
    const existing = await sql`
      SELECT id, primary_role FROM users WHERE email = ${u.email}
    ` as Array<{ id: number; primary_role: string }>;

    let userId: number;
    if (existing.length === 0) {
      const inserted = await sql`
        INSERT INTO users (email, password, first_name, last_name, primary_role, organization, phone, is_active)
        VALUES (${u.email}, ${hashedPassword}, ${u.firstName}, ${u.lastName}, ${u.role}, ${u.organization}, ${u.phone}, TRUE)
        RETURNING id
      ` as Array<{ id: number }>;
      userId = Number(inserted[0]!.id);
      created++;
    } else {
      await sql`
        UPDATE users
        SET password = ${hashedPassword},
            first_name = ${u.firstName},
            last_name = ${u.lastName},
            primary_role = ${u.role},
            organization = ${u.organization},
            phone = ${u.phone},
            updated_at = EXTRACT(EPOCH FROM NOW())::BIGINT
        WHERE email = ${u.email}
      `;
      userId = Number(existing[0]!.id);
      updated++;
    }

    const roleRow = await sql`
      SELECT id FROM user_roles
      WHERE user_id = ${userId} AND role = ${u.role} AND is_active = TRUE
    ` as Array<{ id: number }>;

    if (roleRow.length === 0) {
      await sql`
        INSERT INTO user_roles (user_id, role, is_active, assigned_by)
        VALUES (${userId}, ${u.role}, TRUE, ${userId})
      `;
      rolesAttached++;
    }
  }

  console.log("User seeding complete");
  console.log(`  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Roles attached: ${rolesAttached}`);
  console.log("\nDefault credentials for all users:");
  console.log("  Email: <role>@aft.gov (e.g., requestor@aft.gov)");
  console.log("  Password: password123");

  process.exit(0);
}

main().catch((err) => {
  console.error("Seeder failed:", err);
  process.exit(1);
});
