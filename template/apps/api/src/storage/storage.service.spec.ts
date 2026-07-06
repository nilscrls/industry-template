import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PRESIGN_TTL_SECONDS, StorageService } from "./storage.service";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://signed.example/url"),
}));

const signed = vi.mocked(getSignedUrl);

let service: StorageService;

beforeEach(() => {
  signed.mockClear();
  service = new StorageService();
});

describe("StorageService.presignUpload", () => {
  it("signs a PutObjectCommand for the key and content type with the shared TTL", async () => {
    const url = await service.presignUpload(
      "uploads/report.pdf",
      "application/pdf"
    );
    expect(url).toBe("https://signed.example/url");

    const call = signed.mock.calls[0];
    expect(call).toBeDefined();
    const [, command, options] = call as NonNullable<typeof call>;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect((command as PutObjectCommand).input).toMatchObject({
      Key: "uploads/report.pdf",
      ContentType: "application/pdf",
    });
    expect(options).toEqual({ expiresIn: PRESIGN_TTL_SECONDS });
  });
});

describe("StorageService.presignDownload", () => {
  it("signs a GetObjectCommand and URL-encodes the download filename", async () => {
    await service.presignDownload("uploads/x", "année rapport.pdf");

    const call = signed.mock.calls[0];
    expect(call).toBeDefined();
    const [, command] = call as NonNullable<typeof call>;
    expect(command).toBeInstanceOf(GetObjectCommand);
    const disposition = (command as GetObjectCommand).input
      .ResponseContentDisposition;
    expect(disposition).toContain("attachment;");
    expect(disposition).toContain(encodeURIComponent("année rapport.pdf"));
  });
});

describe("StorageService.deleteObject", () => {
  it("sends a DeleteObjectCommand for the key", async () => {
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockResolvedValue(undefined as never);

    await service.deleteObject("uploads/gone.pdf");

    const call = send.mock.calls[0];
    expect(call).toBeDefined();
    const command = (
      call as NonNullable<typeof call>
    )[0] as unknown as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toMatchObject({ Key: "uploads/gone.pdf" });
  });
});
