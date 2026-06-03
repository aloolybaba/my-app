package com.crackersschematics.renderbridge;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import eu.pb4.simpleimagerenderer.renderer.RegionImageRenderer;
import eu.pb4.simpleimagerenderer.renderer.RendererSettings;
import eu.pb4.simpleimagerenderer.util.RenderUtils;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockBox;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.permissions.PermissionSet;
import net.minecraft.util.Mth;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Stream;

public class SchematicRenderBridge implements ClientModInitializer {
    private static final Gson GSON = new Gson();
    private static final AtomicBoolean BUSY = new AtomicBoolean(false);
    private static final int POLL_TICKS = 40;
    private static int tickCounter = 0;

    @Override
    public void onInitializeClient() {
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            if (++tickCounter < POLL_TICKS || BUSY.get()) {
                return;
            }
            tickCounter = 0;
            findNextPendingJob().ifPresent(path -> {
                BUSY.set(true);
                CompletableFuture.runAsync(() -> runJob(path))
                        .whenComplete((ignored, error) -> BUSY.set(false));
            });
        });
    }

    private static java.util.Optional<Path> findNextPendingJob() {
        Path jobsDir = jobsDir();
        if (!Files.isDirectory(jobsDir)) {
            return java.util.Optional.empty();
        }

        try (Stream<Path> stream = Files.list(jobsDir)) {
            return stream
                    .filter(Files::isDirectory)
                    .filter(path -> Files.exists(path.resolve("status.json")))
                    .filter(path -> status(path).equals("pending"))
                    .sorted(Comparator.comparing(Path::getFileName))
                    .findFirst();
        } catch (Throwable error) {
            error.printStackTrace();
            return java.util.Optional.empty();
        }
    }

    private static Path jobsDir() {
        String configured = System.getProperty("schematic.render.jobs");
        if (configured != null && !configured.isBlank()) {
            return Path.of(configured);
        }
        return FabricLoader.getInstance().getGameDir().resolve("schematic-render-jobs");
    }

    private static String status(Path jobDir) {
        try {
            JsonObject object = GSON.fromJson(Files.readString(jobDir.resolve("status.json")), JsonObject.class);
            return object.get("status").getAsString();
        } catch (Throwable ignored) {
            return "";
        }
    }

    private static void writeStatus(Path jobDir, String status, String error) {
        try {
            JsonObject object = new JsonObject();
            object.addProperty("status", status);
            object.addProperty("updatedAt", java.time.Instant.now().toString());
            if (error != null) {
                object.addProperty("error", error);
            }
            Files.writeString(jobDir.resolve("status.json"), GSON.toJson(object));
        } catch (Throwable ignored) {
        }
    }

    private static void runJob(Path jobDir) {
        try {
            writeStatus(jobDir, "running", null);
            Minecraft minecraft = Minecraft.getInstance();
            if (minecraft.level == null || minecraft.player == null) {
                throw new IllegalStateException("Open a singleplayer world before rendering jobs.");
            }

            MinecraftServer server = minecraft.getSingleplayerServer();
            if (server == null) {
                throw new IllegalStateException("The bridge currently requires a singleplayer world.");
            }

            JsonObject job = GSON.fromJson(Files.readString(jobDir.resolve("blocks.json")), JsonObject.class);
            JsonObject size = job.getAsJsonObject("size");
            JsonObject settings = job.getAsJsonObject("settings");
            JsonArray blocks = job.getAsJsonArray("blocks");

            int width = size.get("width").getAsInt();
            int height = size.get("height").getAsInt();
            int length = size.get("length").getAsInt();
            int imageWidth = settings.get("width").getAsInt();
            int imageHeight = settings.get("height").getAsInt();
            boolean renderEdge = settings.get("renderEdge").getAsBoolean();
            boolean ignoreLighting = settings.get("ignoreLighting").getAsBoolean();
            boolean cleanup = settings.get("cleanup").getAsBoolean();

            ServerLevel serverLevel = server.getLevel(minecraft.level.dimension());
            if (serverLevel == null) {
                throw new IllegalStateException("Could not resolve the current server level.");
            }

            int baseX = Mth.floor(minecraft.player.getX()) + 48;
            int baseY = Math.max(16, Math.min(160, Mth.floor(minecraft.player.getY())));
            int baseZ = Mth.floor(minecraft.player.getZ()) + 48;
            BlockPos start = new BlockPos(baseX, baseY, baseZ);
            BlockPos end = new BlockPos(baseX + width - 1, baseY + height - 1, baseZ + length - 1);

            CompletableFuture<Void> placementDone = new CompletableFuture<>();
            server.execute(() -> {
                try {
                    runFill(server, start.offset(-2, -2, -2), end.offset(2, 2, 2), "minecraft:air");
                    for (int i = 0; i < blocks.size(); i++) {
                        JsonObject block = blocks.get(i).getAsJsonObject();
                        BlockPos pos = start.offset(
                                block.get("x").getAsInt(),
                                block.get("y").getAsInt(),
                                block.get("z").getAsInt()
                        );
                        runSetBlock(server, pos, block.get("state").getAsString());
                    }
                    placementDone.complete(null);
                } catch (Throwable error) {
                    placementDone.completeExceptionally(error);
                }
            });
            placementDone.join();

            sleep(2500);

            CompletableFuture<Void> renderDone = new CompletableFuture<>();
            minecraft.execute(() -> {
                try {
                    RegionImageRenderer renderer = new RegionImageRenderer(
                            minecraft,
                            imageWidth,
                            imageHeight,
                            minecraft.level,
                            BlockBox.of(start, end),
                            renderEdge,
                            ignoreLighting
                    );
                    RendererSettings renderSettings = RendererSettings.defaultSettings.clone();
                    autoFit(renderSettings, width, height, length, imageWidth, imageHeight);
                    renderSettings.renderEdge = renderEdge;
                    renderSettings.ignoreLighting = ignoreLighting;
                    renderSettings.applyAll(renderer);

                    renderer.render((target, box, frame) -> {
                        try {
                            Path outputPath = jobDir.resolve("output.png");
                            RenderUtils.writeToNativeImage(target, image -> image.writeToFile(outputPath));
                            writeStatus(jobDir, "done", null);
                            renderDone.complete(null);
                        } catch (Throwable error) {
                            writeStatus(jobDir, "error", error.getMessage());
                            renderDone.completeExceptionally(error);
                        } finally {
                            renderer.close();
                            if (cleanup) {
                                MinecraftServer cleanupServer = Minecraft.getInstance().getSingleplayerServer();
                                if (cleanupServer != null) {
                                    cleanupServer.execute(() -> runFill(cleanupServer, start.offset(-2, -2, -2), end.offset(2, 2, 2), "minecraft:air"));
                                }
                            }
                        }
                    }, false);
                } catch (Throwable error) {
                    writeStatus(jobDir, "error", error.getMessage());
                    renderDone.completeExceptionally(error);
                }
            });
            renderDone.join();
        } catch (Throwable error) {
            error.printStackTrace();
            writeStatus(jobDir, "error", error.getMessage());
        }
    }

    private static void autoFit(RendererSettings settings, int width, int height, int length, int imageWidth, int imageHeight) {
        int longest = Math.max(width + length, Math.max(height * 2, Math.max(width, length)));
        int scale = Math.max(8, Math.min(800, (int) Math.floor(Math.min(imageWidth, imageHeight) * 90.0 / Math.max(1, longest))));
        settings.width = imageWidth;
        settings.height = imageHeight;
        settings.yaw = -45;
        settings.pitch = 30;
        settings.roll = 0;
        settings.scale = scale;
        settings.x = 0;
        settings.y = 0;
        settings.z = 0;
        settings.renderEntities = false;
        settings.renderNametags = false;
        settings.renderSelf = false;
        settings.renderParticles = false;
    }

    private static void runSetBlock(MinecraftServer server, BlockPos pos, String state) {
        runCommand(server, "setblock " + pos.getX() + " " + pos.getY() + " " + pos.getZ() + " " + state + " replace");
    }

    private static void runFill(MinecraftServer server, BlockPos from, BlockPos to, String state) {
        final int maxEdge = 28;
        for (int x = from.getX(); x <= to.getX(); x += maxEdge) {
            for (int y = from.getY(); y <= to.getY(); y += maxEdge) {
                for (int z = from.getZ(); z <= to.getZ(); z += maxEdge) {
                    int x2 = Math.min(to.getX(), x + maxEdge - 1);
                    int y2 = Math.min(to.getY(), y + maxEdge - 1);
                    int z2 = Math.min(to.getZ(), z + maxEdge - 1);
                    runCommand(server, "fill " + x + " " + y + " " + z + " " + x2 + " " + y2 + " " + z2 + " " + state);
                }
            }
        }
    }

    private static void runCommand(MinecraftServer server, String command) {
        server.getCommands().performPrefixedCommand(
                server.createCommandSourceStack()
                        .withMaximumPermission(PermissionSet.ALL_PERMISSIONS)
                        .withSuppressedOutput(),
                command
        );
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
    }
}
