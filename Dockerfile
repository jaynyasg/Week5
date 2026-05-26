# Use ECR Public Node.js image (Docker Hub is blocked in government environments)
FROM public.ecr.aws/docker/library/node:20-slim AS base

# Set working directory
WORKDIR /app

# Disable SSL strict mode for government VPN environments (MUST be before any npm commands)
RUN npm config set strict-ssl false

# Install the repo-pinned pnpm version
RUN corepack enable && corepack prepare pnpm@10.27.0 --activate && pnpm config set strict-ssl false

FROM base AS deps

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json ./api/
COPY shared/package.json ./shared/
COPY web/package.json ./web/

# Install all dependencies so TypeScript and Vite can build from a fresh clone
RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS builder

# Copy source and build artifacts inside Docker. Render starts from a clean clone,
# so api/dist, shared/dist, and web/dist cannot be expected to exist in Git.
COPY tsconfig.json ./
COPY api ./api
COPY shared ./shared
COPY web ./web
RUN pnpm build

FROM base AS runtime

# Copy package files for production dependency installation
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json ./api/
COPY shared/package.json ./shared/
COPY web/package.json ./web/

# Install production dependencies only (ignore prepare scripts that require dev deps)
RUN pnpm install --frozen-lockfile --prod --ignore-scripts && pnpm store prune

# Copy built output from the builder stage
COPY --from=builder /app/shared/dist/ ./shared/dist/
COPY --from=builder /app/api/dist/ ./api/dist/
COPY --from=builder /app/web/dist/ ./web/dist/

# Expose port
EXPOSE 80

# Set production environment
ENV NODE_ENV=production
ENV VITE_APP_ENV=production
ENV PORT=80

# Start the application (run migrations first to ensure schema exists)
WORKDIR /app/api
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
