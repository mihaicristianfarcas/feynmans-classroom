// Why a browser can or can't save into a synced vault's folder, as the folder help explains it.
import { describe, expect, it } from "vitest";
import { folderSupport } from "../web/src/vaults/sync/support.ts";

describe("folder support", () => {
  it("can save where the browser has the directory picker", () => {
    expect(folderSupport({ showDirectoryPicker: () => {}, isSecureContext: true, navigator: { brave: {} } })).toBe(
      "full",
    );
  });

  it("names Brave, where the picker is off by default", () => {
    expect(folderSupport({ isSecureContext: true, navigator: { brave: {} } })).toBe("brave");
  });

  it("names a page that isn't on localhost or https before the browser", () => {
    expect(folderSupport({ isSecureContext: false, navigator: { brave: {} } })).toBe("insecure");
  });

  it("can't save elsewhere (Firefox, Safari)", () => {
    expect(folderSupport({ isSecureContext: true, navigator: {} })).toBe("none");
  });
});
