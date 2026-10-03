import { describe, expect, it } from "vitest";
import { ClientUpdateSchema, RepositoryInputSchema, TunnelUpdateSchema } from "./schemas.js";

describe("RepositoryInputSchema", () => {
    const repository = {
        baseUrl: "https://pbs.example.com:8007",
        datastore: "backups",
        fingerprint: "",
        username: "root@pam",
        tokenname: "",
    };

    it("accepts an update without a secret: the stored one is kept", () => {
        expect(RepositoryInputSchema.safeParse(repository).success).toBe(true);
    });

    it("accepts a secret, to set or change it", () => {
        expect(RepositoryInputSchema.parse({ ...repository, secret: "s3cret" }).secret).toBe("s3cret");
    });

    it("refuses a repository without a datastore", () => {
        const parsed = RepositoryInputSchema.safeParse({ ...repository, datastore: "" });
        expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([["datastore"]]);
    });
});

describe("ClientUpdateSchema", () => {
    it("normalises the target address it accepts", () => {
        expect(ClientUpdateSchema.parse({ outboundTargetAddress: " 10.0.0.5 " })).toEqual({
            outboundTargetAddress: "10.0.0.5:3001",
        });
    });

    it("refuses a target address with a path", () => {
        const parsed = ClientUpdateSchema.safeParse({ outboundTargetAddress: "10.0.0.5/ws" });
        expect(parsed.error?.issues[0]?.message).toBe(
            "Must be a host or host:port, without scheme, path or credentials",
        );
    });

    it("tells an allowed address switched off from one left alone", () => {
        expect(ClientUpdateSchema.parse({ inboundAllowedIp: null })).toEqual({ inboundAllowedIp: null });
        expect(ClientUpdateSchema.parse({})).toEqual({});
    });
});

describe("TunnelUpdateSchema", () => {
    it("takes null as a passphrase: the stored one is cleared", () => {
        expect(TunnelUpdateSchema.parse({ passphrase: null })).toEqual({ passphrase: null });
    });

    it("leaves every field out of an update that names none", () => {
        expect(TunnelUpdateSchema.parse({})).toEqual({});
    });
});
