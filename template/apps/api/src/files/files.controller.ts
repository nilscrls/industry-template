import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@repo/contracts";
import { RequireAbility } from "../auth/decorators";
import { FilesService } from "./files.service";

@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @RequireAbility({ action: "read", subject: "File" })
  @Implement(contract.files.list)
  list() {
    return implement(contract.files.list).handler(({ input }) => this.files.list(input));
  }

  @RequireAbility({ action: "create", subject: "File" })
  @Implement(contract.files.presignUpload)
  presignUpload() {
    return implement(contract.files.presignUpload).handler(({ input }) => this.files.presignUpload(input));
  }

  @RequireAbility({ action: "read", subject: "File" })
  @Implement(contract.files.presignDownload)
  presignDownload() {
    return implement(contract.files.presignDownload).handler(({ input }) =>
      this.files.presignDownload(input.id)
    );
  }

  @RequireAbility({ action: "delete", subject: "File" })
  @Implement(contract.files.remove)
  remove() {
    return implement(contract.files.remove).handler(({ input }) => this.files.remove(input.id));
  }
}
