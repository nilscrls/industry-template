import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@repo/contracts";
import { AuditService } from "../audit/audit.service";
import { RequirePermission } from "../auth/decorators";
import { FilesService } from "./files.service";

@Controller()
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly audit: AuditService
  ) {}

  @RequirePermission({ relation: "can_read_file", scope: "org" })
  @Implement(contract.files.list)
  list() {
    return implement(contract.files.list).handler(({ input }) =>
      this.files.list(input)
    );
  }

  @RequirePermission({ relation: "can_create_file", scope: "org" })
  @Implement(contract.files.presignUpload)
  presignUpload() {
    return implement(contract.files.presignUpload)
      .use(
        this.audit.audited({
          action: "file.upload",
          entityType: "File",
          entityId: (_input, output: { file: { id: string } }) =>
            output.file.id,
        })
      )
      .handler(({ input }) => this.files.presignUpload(input));
  }

  @RequirePermission({ relation: "can_read_file", scope: "org" })
  @Implement(contract.files.presignDownload)
  presignDownload() {
    return implement(contract.files.presignDownload).handler(({ input }) =>
      this.files.presignDownload(input.id)
    );
  }

  // Row-level check (can_delete) runs in the service via FGA.
  @RequirePermission({ relation: "can_read_file", scope: "org" })
  @Implement(contract.files.remove)
  remove() {
    return implement(contract.files.remove)
      .use(this.audit.audited({ action: "file.delete", entityType: "File" }))
      .handler(({ input }) => this.files.remove(input.id));
  }
}
