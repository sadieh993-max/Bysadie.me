# Step 1 - Environment validation and project bootstrap

## 1) Validate toolchain
```bash
python3.11 --version
docker --version
docker compose version
git --version
```

## 2) Create and activate environment
```bash
cd revenue-intelligence
./scripts/bootstrap.sh
source .venv/bin/activate
```

## 3) Start infrastructure services
```bash
docker compose -f infra/docker-compose.yml up -d postgres redis
```

## 4) Run migrations
```bash
alembic upgrade head
```

## 5) Start API and worker
```bash
docker compose -f infra/docker-compose.yml up -d api worker
```

## 6) Verify health
```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"status":"healthy"}
```
