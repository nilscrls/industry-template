import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@repo/contracts";
import { AuditService } from "../audit/audit.service";
import { RequirePermission } from "../auth/decorators";
import { ProjectsService } from "./projects.service";

@Controller()
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly audit: AuditService
  ) {}

  // No coarse guard: a user with zero memberships holds no `read Project`
  // rule at all, yet must get an empty list (the service scopes the query).
  @Implement(contract.projects.list)
  list() {
    return implement(contract.projects.list).handler(({ input }) =>
      this.projects.list(input)
    );
  }

  // Org-wide aggregate counts for the dashboard — visible to any signed-in
  // user; no project contents are exposed.
  @Implement(contract.projects.stats)
  stats() {
    return implement(contract.projects.stats).handler(() =>
      this.projects.stats()
    );
  }

  // Row-level relation checks happen in the service (conditions need the row).
  @Implement(contract.projects.find)
  find() {
    return implement(contract.projects.find).handler(({ input }) =>
      this.projects.find(input.id)
    );
  }

  @RequirePermission({ relation: "can_create_project", scope: "org" })
  @Implement(contract.projects.create)
  create() {
    return implement(contract.projects.create)
      .use(
        this.audit.audited({ action: "project.create", entityType: "Project" })
      )
      .handler(({ input }) => this.projects.create(input));
  }

  // Row-level relation checks (can_update via FGA) happen in the service.
  @RequirePermission({ relation: "can_read_project", scope: "org" })
  @Implement(contract.projects.update)
  update() {
    return implement(contract.projects.update)
      .use(
        this.audit.audited({ action: "project.update", entityType: "Project" })
      )
      .handler(({ input }) => this.projects.update(input));
  }

  @RequirePermission({ relation: "can_read_project", scope: "org" })
  @Implement(contract.projects.remove)
  remove() {
    return implement(contract.projects.remove)
      .use(
        this.audit.audited({ action: "project.delete", entityType: "Project" })
      )
      .handler(({ input }) => this.projects.remove(input.id));
  }

  @Implement(contract.projects.listMembers)
  listMembers() {
    return implement(contract.projects.listMembers).handler(({ input }) =>
      this.projects.listMembers(input.id)
    );
  }

  // `can_manage_members` on the specific project (owner relation or admin)
  // — checked in the service against the row via FGA.
  @Implement(contract.projects.setMember)
  setMember() {
    return implement(contract.projects.setMember)
      .use(
        this.audit.audited({
          action: "project.member.set",
          entityType: "Project",
        })
      )
      .handler(({ input }) => this.projects.setMember(input));
  }

  @Implement(contract.projects.removeMember)
  removeMember() {
    return implement(contract.projects.removeMember)
      .use(
        this.audit.audited({
          action: "project.member.remove",
          entityType: "Project",
        })
      )
      .handler(({ input }) => this.projects.removeMember(input));
  }
}
