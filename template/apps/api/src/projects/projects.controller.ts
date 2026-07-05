import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@repo/contracts";
import { AuditService } from "../audit/audit.service";
import { RequireAbility } from "../auth/decorators";
import { ProjectsService } from "./projects.service";

@Controller()
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly audit: AuditService
  ) {}

  @RequireAbility({ action: "read", subject: "Project" })
  @Implement(contract.projects.list)
  list() {
    return implement(contract.projects.list).handler(({ input }) =>
      this.projects.list(input)
    );
  }

  @RequireAbility({ action: "read", subject: "Project" })
  @Implement(contract.projects.stats)
  stats() {
    return implement(contract.projects.stats).handler(() =>
      this.projects.stats()
    );
  }

  @RequireAbility({ action: "read", subject: "Project" })
  @Implement(contract.projects.find)
  find() {
    return implement(contract.projects.find).handler(({ input }) =>
      this.projects.find(input.id)
    );
  }

  @RequireAbility({ action: "create", subject: "Project" })
  @Implement(contract.projects.create)
  create() {
    return implement(contract.projects.create)
      .use(
        this.audit.audited({ action: "project.create", entityType: "Project" })
      )
      .handler(({ input }) => this.projects.create(input));
  }

  // Row-level ownership is enforced in the service (conditions need the row).
  @RequireAbility({ action: "update", subject: "Project" })
  @Implement(contract.projects.update)
  update() {
    return implement(contract.projects.update)
      .use(
        this.audit.audited({ action: "project.update", entityType: "Project" })
      )
      .handler(({ input }) => this.projects.update(input));
  }

  @RequireAbility({ action: "delete", subject: "Project" })
  @Implement(contract.projects.remove)
  remove() {
    return implement(contract.projects.remove)
      .use(
        this.audit.audited({ action: "project.delete", entityType: "Project" })
      )
      .handler(({ input }) => this.projects.remove(input.id));
  }
}
