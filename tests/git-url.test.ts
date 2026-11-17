import { describe, expect, test } from "bun:test";
import { buildCloneUrl } from "../src/core/git";
import { RemoteConfigSchema } from "../src/types/config";

const remote = (o: object) => RemoteConfigSchema.parse({ repo: "o/r", ...o });

describe("buildCloneUrl", () => {
  test("defaults to https", () => {
    expect(buildCloneUrl(remote({}))).toBe("https://github.com/o/r.git");
  });
  test("ssh protocol", () => {
    expect(buildCloneUrl(remote({ protocol: "ssh" }))).toBe("git@github.com:o/r.git");
  });
  test("ssh with custom host", () => {
    expect(buildCloneUrl(remote({ type: "gitlab", host: "git.example.com", protocol: "ssh" }))).toBe(
      "git@git.example.com:o/r.git",
    );
  });
});
