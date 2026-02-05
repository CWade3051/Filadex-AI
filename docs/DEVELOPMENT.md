# Development Guide

This guide provides detailed information for developers working on Filadex.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Database Management](#database-management)
- [Code Style](#code-style)
- [Testing](#testing)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** v16 or higher ([Download](https://nodejs.org/))
- **PostgreSQL** v12 or higher ([Download](https://www.postgresql.org/download/))
- **npm** (comes with Node.js) or **yarn**
- **Git**

### Optional Tools

- **Docker** and **Docker Compose** (for containerized development)
- **VS Code** or your preferred IDE with TypeScript support

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/filadex.git
cd filadex
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` and update the database connection string:

```env
DATABASE_URL=postgres://username:password@localhost:5432/filadex
```

### 4. Set Up Database

Create a PostgreSQL database:

```bash
createdb filadex
# Or using psql:
# psql -U postgres -c "CREATE DATABASE filadex;"
```

Push the database schema:

```bash
npm run db:push
```

(Optional) Initialize with sample data:

```bash
npm run db:init
# Or set INIT_SAMPLE_DATA=true in .env and run:
# INIT_SAMPLE_DATA=true node init-data.js
```

### 5. Start Development Server

```bash
npm run dev
```

The application will be available at:
- **Frontend & API**: http://localhost:5000
- **Default credentials**: `admin` / `admin` (change on first login)

### Using the Setup Script

Alternatively, use the automated setup script:

```bash
npm run setup
# or
bash scripts/setup-local.sh
```

## Project Structure

```
filadex/
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # React components
│   │   │   └── ui/         # shadcn/ui components
│   │   ├── pages/          # Page components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities and helpers
│   │   └── i18n/           # Internationalization
│   └── public/             # Static assets
│
├── server/                 # Backend Express application
│   ├── index.ts           # Server entry point
│   ├── routes.ts          # API routes
│   ├── auth.ts            # Authentication logic
│   ├── db.ts              # Database connection
│   └── vite.ts            # Vite integration
│
├── shared/                 # Shared code between client/server
│   └── schema.ts          # Database schema (Drizzle ORM)
│
├── migrations/             # Database migration scripts
├── resources/              # CSV resource files
├── scripts/                # Utility scripts
├── docs/                   # Documentation
│
├── .env.example           # Environment variables template
├── .cursorrules           # AI agent development rules
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite configuration
└── tailwind.config.ts     # TailwindCSS configuration
```

## Development Workflow

### Running the Application

**Development mode** (with hot reload):
```bash
npm run dev
```

**Production build**:
```bash
npm run build
npm start
```

**Type checking** (without building):
```bash
npm run check
# or
npm run type-check
```

### Branch Strategy

- `main` - Production-ready code
- `dev` - Development branch for new features
- Feature branches - `feature/feature-name`

### Making Changes

1. Create a feature branch from `dev`:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/your-feature-name
   ```

2. Make your changes following the [Code Style](#code-style) guidelines

3. Test your changes locally

4. Commit with descriptive messages:
   ```bash
   git add .
   git commit -m "feat: add new filament filter feature"
   ```

5. Push and create a pull request

## Database Management

### Schema Changes

The database schema is defined in `shared/schema.ts` using Drizzle ORM.

**To update the database schema:**

1. Modify the schema in `shared/schema.ts`
2. Push changes to the database:
   ```bash
   npm run db:push
   ```

**Note**: `db:push` generates SQL migrations automatically. For production, you may want to use Drizzle migrations instead.

### Running Migrations

Manual migrations are in the `migrations/` directory:

```bash
node run-migration.js
```

### Initializing Data

Initialize the database with sample data:

```bash
npm run db:init
# or
node init-data.js
```

Set `INIT_SAMPLE_DATA=true` in `.env` to include sample filaments.

### Database Connection

The application uses PostgreSQL. Connection is configured via:

- `DATABASE_URL` (recommended): Full connection string
- Individual variables: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `PGHOST`, `PGPORT`

## Code Style

### TypeScript

- Use TypeScript for all new code
- Avoid `.js` files unless necessary (legacy scripts)
- Use strict TypeScript settings
- Prefer type inference, but be explicit for public APIs

### React Components

- Use functional components with hooks
- PascalCase for component names
- Props interfaces should be defined above the component
- Use named exports

Example:
```typescript
interface FilamentCardProps {
  filament: Filament;
  onEdit?: () => void;
}

export function FilamentCard({ filament, onEdit }: FilamentCardProps) {
  // Component implementation
}
```

### File Naming

- Components: `PascalCase.tsx` (e.g., `FilamentCard.tsx`)
- Utilities: `kebab-case.ts` (e.g., `api-utils.ts`)
- Types: `PascalCase.ts` (e.g., `types.ts`)

### API Routes

- Routes are defined in `server/routes.ts`
- Use middleware for authentication: `authenticate`, `isAdmin`
- Return consistent JSON responses
- Handle errors appropriately

Example:
```typescript
app.get('/api/filaments', authenticate, async (req, res) => {
  try {
    const filaments = await db.select().from(filaments).where(...);
    res.json(filaments);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});
```

### Styling

- Use TailwindCSS utility classes
- Use shadcn/ui components from `client/src/components/ui/`
- Theme configuration is in `theme.json`
- Dark mode is built-in

### Internationalization

- Translation files: `client/src/i18n/locales/`
- Use `useTranslation()` hook
- Add translations to both `en.ts` and `de.ts`
- Keep keys organized by feature

## Testing

### Manual Testing

1. Start the development server: `npm run dev`
2. Access http://localhost:5000
3. Test features manually

### Type Checking

```bash
npm run check
```

This runs TypeScript compiler without emitting files.

## Common Tasks

### Adding a New API Endpoint

1. Open `server/routes.ts`
2. Add your route with appropriate middleware:
   ```typescript
   app.get('/api/your-endpoint', authenticate, async (req, res) => {
     // Implementation
   });
   ```
3. Use Drizzle ORM for database queries
4. Return JSON responses

### Adding a New Component

1. Create component in `client/src/components/`
2. Use TypeScript interfaces for props
3. Style with TailwindCSS
4. Add translations if needed
5. Export if needed

### Adding a New Database Table

1. Define schema in `shared/schema.ts`:
   ```typescript
   export const yourTable = pgTable("your_table", {
     id: serial("id").primaryKey(),
     // ... fields
   });
   ```
2. Run `npm run db:push` to create the table
3. Update types if needed

### Adding Translations

1. Add keys to `client/src/i18n/locales/en.ts`:
   ```typescript
   export default {
     // ... existing
     yourKey: "Your English Text",
   };
   ```
2. Add same key to `client/src/i18n/locales/de.ts`
3. Use in components: `const { t } = useTranslation(); t('yourKey')`

## Troubleshooting

### Database Connection Issues

**Error**: `DATABASE_URL must be set`

- Ensure `.env` file exists and contains `DATABASE_URL`
- Check PostgreSQL is running: `pg_isready` or `psql -U postgres`
- Verify connection string format: `postgres://user:password@host:port/database`

**Error**: `Connection refused`

- Check PostgreSQL is running
- Verify host and port in connection string
- Check firewall settings

### Port Already in Use

**Error**: `Port 5000 is already in use`

- Change `PORT` in `.env` file
- Or kill the process using port 5000:
  ```bash
  lsof -ti:5000 | xargs kill
  ```

### TypeScript Errors

**Error**: Type errors after changes

- Run `npm run check` to see all errors
- Ensure all imports are correct
- Check `tsconfig.json` paths are configured

### Build Issues

**Error**: Build fails

- Clear `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear build cache: `rm -rf dist`
- Check Node.js version: `node -v` (should be v16+)

### Database Schema Issues

**Error**: Table doesn't exist

- Run `npm run db:push` to sync schema
- Check `shared/schema.ts` for correct table definitions

## Backup & Restore

### Shell Script Backups (Full Database)

```bash
# Create backup
./scripts/backup.sh        # Local dev
./scripts/backup-docker.sh # Docker prod

# Restore from backup
./scripts/restore.sh        # Local dev
./scripts/restore-docker.sh # Docker prod
```

Backups are stored in `backups/` directory and include:
- Full PostgreSQL dump (all tables)
- Uploaded filament images
- Uploaded slicer profile files

The database dump includes photo import review queue data (`upload_sessions`, `pending_uploads`).

### Web UI Backups (JSON)

Access via **Tools > Cloud Backup** in the app:

| Method | Description |
|--------|-------------|
| Local | Download/upload JSON files |
| S3 | AWS S3, Backblaze B2, Wasabi, MinIO |
| WebDAV | Nextcloud, ownCloud, Synology |
| Admin Full | All users' data (admin only) |

### What's Backed Up

| Data | Shell | Web (User) | Web (Admin) |
|------|-------|------------|-------------|
| Database tables | All | User's data | All users |
| Images | Yes | No | No |
| Slicer profile files | Yes | No | No |
| Passwords | Hashed | No | No |
| API keys | Encrypted | No | No |

## Additional Resources

- [API Documentation](./API.md)
- [Scripts Documentation](../scripts/SCRIPTS.md)
- [Translation Guide](./TRANSLATION_GUIDE.md)
- [Contributing Guidelines](../CONTRIBUTING.md)
- [Project README](../README.md)

## Getting Help

- Check existing [GitHub Issues](https://github.com/yourusername/filadex/issues)
- Review documentation in `docs/` directory
- Ask questions in discussions or create an issue

---

Happy coding! 🚀

