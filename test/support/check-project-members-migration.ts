import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new DatabaseSync(":memory:");
try {
  db.exec("PRAGMA foreign_keys = ON");
  const migrations = readdirSync("migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of migrations.filter((file) => !file.startsWith("0008_")))
    db.exec(readFileSync(`migrations/${file}`, "utf8"));
  db.exec(`INSERT INTO members (id, clerk_user_id, display_name, role, created_at, removed_at) VALUES
      ('owner','owner','Owner','owner',1,NULL), ('creator','creator','Creator','editor',1,NULL),
      ('other','other','Other','editor',1,NULL), ('removed','removed','Removed','editor',1,2);
      INSERT INTO projects (id,name,created_by,created_at,updated_at) VALUES
      ('p','Old work','creator',1,1), ('q','Other work','owner',1,1), ('r','Removed creator','removed',1,1);`);
  db.exec(
    readFileSync(`migrations/${migrations.find((file) => file.startsWith("0008_"))}`, "utf8"),
  );
  assert.deepEqual(
    db
      .prepare("SELECT project_id, member_id, role FROM project_members ORDER BY project_id")
      .all()
      .map((row) => ({ ...row })),
    [
      { project_id: "p", member_id: "creator", role: "editor" },
      { project_id: "q", member_id: "owner", role: "editor" },
    ],
  );
  db.exec("DELETE FROM projects WHERE id = 'p'");
  assert.deepEqual(db.prepare("SELECT * FROM project_members WHERE project_id = 'p'").all(), []);
} finally {
  db.close();
}
