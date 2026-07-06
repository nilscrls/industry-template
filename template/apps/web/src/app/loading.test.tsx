import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import RootLoading from "./loading";

describe("RootLoading", () => {
  it("renders a skeleton placeholder region", () => {
    const { container } = render(<RootLoading />);
    // A <main> with several skeleton blocks — the app's loading fallback.
    expect(container.querySelector("main")).toBeTruthy();
    expect(container.querySelectorAll("div").length).toBeGreaterThan(0);
  });
});
