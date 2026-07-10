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

  @RequirePermission({ relation: "can_read_project", scope: "org" })
  @Implement(contract.projects.list)
  list() {
    return implement(contract.projects.list).handler(({ input }) =>
      this.projects.list(input)
    );
  }

  @RequirePermission({ relation: "can_read_project", scope: "org" })
  @Implement(contract.projects.stats)
  stats() {
    return implement(contract.projects.stats).handler(() =>
      this.projects.stats()
    );
  }

  @RequirePermission({ relation: "can_read_project", scope: "org" })
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

  // Row-level checks (can_update / can_delete) run in the service via FGA.
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
}
