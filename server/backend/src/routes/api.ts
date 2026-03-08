import { FastifyInstance } from "fastify";
import { AuthController } from "../controllers/AuthController.js";
import { UserController } from "../controllers/UserController.js";
import { ClientController } from "../controllers/ClientController.js";
import { JobController } from "../controllers/JobController.js";
import { RepositoryController } from "../controllers/RepositoryController.js";
import { TokenController } from "../controllers/TokenController.js";
import { SettingsController } from "../controllers/SettingsController.js";
import { HistoryController } from "../controllers/HistoryController.js";

export default async function apiRoutes(fastify: FastifyInstance) {
    // Auth
    fastify.post("/login", AuthController.login);
    fastify.get("/auth/config", AuthController.getConfig);
    fastify.get("/auth/login", AuthController.oidcLogin);
    fastify.get("/auth/callback", AuthController.oidcCallback);

    // Register /api/v1 routes
    fastify.register(
        async (v1) => {
            // Protected Routes
            v1.register(async (protectedRoutes) => {
                protectedRoutes.addHook("onRequest", async (request, reply) => {
                    try {
                        await request.jwtVerify();
                    } catch (err) {
                        reply.send(err);
                    }
                });

                // Users
                protectedRoutes.get("/users", UserController.list);
                protectedRoutes.post("/users", UserController.create);
                protectedRoutes.put("/users/:userId", UserController.update);
                protectedRoutes.delete("/users/:userId", UserController.delete);

                // Clients
                protectedRoutes.get("/clients", ClientController.list);
                protectedRoutes.delete(
                    "/clients/:clientId",
                    ClientController.delete,
                );
                protectedRoutes.put(
                    "/clients/:clientId",
                    ClientController.update,
                );

                // Client Routes
                protectedRoutes.get(
                    "/clients/:clientId/history",
                    ClientController.getHistory,
                );
                protectedRoutes.get(
                    "/clients/:clientId/fs",
                    ClientController.getFs,
                );
                protectedRoutes.get(
                    "/clients/:clientId/version",
                    ClientController.getVersion,
                );

                // Client Jobs (Nested)
                protectedRoutes.get(
                    "/clients/:clientId/jobs",
                    JobController.list,
                );
                protectedRoutes.post(
                    "/clients/:clientId/jobs",
                    JobController.save,
                );
                protectedRoutes.delete(
                    "/clients/:clientId/jobs/:jobId",
                    JobController.delete,
                );

                // Global Jobs
                protectedRoutes.get("/jobs", JobController.listAll);

                // Global History
                protectedRoutes.get(
                    "/history",
                    HistoryController.getGlobalHistory,
                );

                // Client Keys
                protectedRoutes.post(
                    "/clients/:clientId/key",
                    JobController.generateKey,
                );

                // Client Actions
                protectedRoutes.post(
                    "/clients/:clientId/jobs/:jobId/run",
                    JobController.triggerBackup,
                );
                protectedRoutes.post(
                    "/clients/:clientId/restore",
                    JobController.triggerRestore,
                );

                // Repositories
                protectedRoutes.get("/repositories", RepositoryController.list);
                protectedRoutes.get(
                    "/repositories/:repositoryId/status",
                    RepositoryController.getStatus,
                );
                protectedRoutes.post(
                    "/repositories",
                    RepositoryController.create,
                );
                protectedRoutes.put(
                    "/repositories/:repositoryId",
                    RepositoryController.update,
                );
                protectedRoutes.delete(
                    "/repositories/:repositoryId",
                    RepositoryController.delete,
                );
                protectedRoutes.get(
                    "/repositories/:repositoryId/snapshots",
                    RepositoryController.listSnapshots,
                );

                // Registration Tokens
                protectedRoutes.get("/tokens", TokenController.list);
                protectedRoutes.post("/tokens", TokenController.create);
                protectedRoutes.delete(
                    "/tokens/:token",
                    TokenController.delete,
                );

                // Settings
                protectedRoutes.get(
                    "/settings/cleanup",
                    SettingsController.getSettings,
                );
                protectedRoutes.put(
                    "/settings/cleanup",
                    SettingsController.updateSettings,
                );
                protectedRoutes.post(
                    "/settings/cleanup",
                    SettingsController.runMaintenance,
                );
            });

            // Register Client (Public but API)
            v1.post("/register", TokenController.register);

            // Health check (Public ping)
            v1.get("/ping", async (request, reply) => {
                return { status: "ok" };
            });
        },
        { prefix: "/v1" },
    );
}
