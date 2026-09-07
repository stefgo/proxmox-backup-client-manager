import { logger } from "@pbcm/shared/node";

export interface Observation {
    fingerprint: string;
    caValid: boolean;
    clientId: string;
    at: string;
}

/**
 * Fingerprints reported by client agents.
 *
 * Deliberately in-memory and deliberately never written back into the repository
 * config: a client is the least trusted host in the setup, and letting one dictate the
 * target value would hand every other client the same forged fingerprint. Observations
 * are evidence for the operator, nothing more — adopting a value stays a decision made
 * in the repository editor.
 */
export class FingerprintObservations {
    private static byRepository = new Map<string, Observation>();

    static record(
        repositoryId: string,
        clientId: string,
        fingerprint: string,
        caValid: boolean,
    ): void {
        this.byRepository.set(repositoryId, {
            fingerprint,
            caValid,
            clientId,
            at: new Date().toISOString(),
        });
        logger.info(
            { repositoryId, clientId, fingerprint, caValid },
            "Client reported a certificate fingerprint",
        );
    }

    static get(repositoryId: string): Observation | undefined {
        return this.byRepository.get(repositoryId);
    }
}
