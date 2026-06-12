# Expense Tracker Backend

Node.js + Express + MongoDB backend for the Expense Tracker application.

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` file in the root directory:

```
mongodburl=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
PORT=5000
NODE_ENV=development
```

## Running the Server

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user (requires auth)
- `PUT /api/auth/profile` - Update user profile (requires auth)

### Expenses
- `POST /api/expenses` - Create expense (requires auth)
- `GET /api/expenses` - Get all expenses (requires auth)
- `GET /api/expenses/:id` - Get single expense (requires auth)
- `PUT /api/expenses/:id` - Update expense (requires auth)
- `DELETE /api/expenses/:id` - Delete expense (requires auth)

### Dashboard
- `GET /api/dashboard/daily/:date` - Get daily summary
- `GET /api/dashboard/weekly/:date` - Get weekly summary
- `GET /api/dashboard/monthly/:year/:month` - Get monthly summary
- `GET /api/dashboard/yearly/:year` - Get yearly summary
- `GET /api/dashboard/overview/all` - Get all-time overview

## Categories

- Food
- Transportation
- Entertainment
- Utilities
- Healthcare
- Shopping
- Education
- Other
