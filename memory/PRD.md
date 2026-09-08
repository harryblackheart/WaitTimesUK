# A&E Hospital Wait Times - Product Requirements Document

## Original Problem Statement
App allowing users to update current wait times in A&E departments of UK hospitals. Features include:
- Search by postcode for closest hospital with A&E, sort by lowest wait times
- Users can update wait times manually. If not within 10km, goes to Admin Approval queue
- Free users can sign up without payment, but wait times are blurred (lock icon). Can still submit updates
- Paid users (£4.99 via PayPal link) can see actual wait times
- Admin dashboard: override times, approve pending updates, manage user paid status, trigger web scraping
- Automatic hourly scraping from waitsmart.co.uk
- Red color for wait times 3+ hours
- NHS blue theme. SEO optimized (sitemap, robots.txt, meta tags)
- Contact form that does NOT expose the admin email address
- No cooldown timer on wait time updates

## User Personas
1. **General Public** - View hospitals, see blurred wait times, search by postcode
2. **Free Users** - All above + can submit wait time updates
3. **Paid Users** - Full access to actual wait times, can update wait times, submit new hospitals
4. **Admin** - Approve hospitals/updates, override wait times, manage users, read contact messages, trigger scraping

## Core Requirements
- NHS blue theme (#005EB8)
- ~203 hospitals seeded (30 initial + scraped from WaitSmart)
- PayPal NCP link integration for payment (admin manually toggles paid status)
- JWT-based authentication
- MongoDB database (Motor async)
- Postcodes.io API for geolocation
- BeautifulSoup scraper for waitsmart.co.uk
- Resend email integration for contact form forwarding

## Tech Stack
- Frontend: React (CRA) + Tailwind CSS + shadcn/ui
- Backend: FastAPI + Motor (async MongoDB)
- DB: MongoDB
- External APIs: postcodes.io, waitsmart.co.uk, Resend

## What's Been Implemented

### Backend (FastAPI)
- User authentication (register/login with JWT)
- Hospital CRUD with approval workflow
- Wait time updates with geolocation verification (10km auto-approve, else pending)
- Admin endpoints for approvals/overrides/user management
- Postcode search with distance calculation (Haversine formula)
- WaitSmart web scraper (hourly auto + manual admin trigger)
- Contact form endpoint (POST /api/contact) - stores in DB + sends via Resend
- Admin contact messages CRUD (GET/PATCH/DELETE /api/admin/messages)
- Name masking for user privacy
- SEO: sitemap.xml, robots.txt

### Frontend (React + Tailwind + shadcn/ui)
- Hero section with postcode search
- Hospital list with wait time badges (color-coded, red for 3h+)
- Blurred wait times for non-paid users (lock icon)
- Login/Register pages
- Admin dashboard with 5 tabs: Pending Hospitals, Pending Wait Updates, All Hospitals, Users, Messages
- Contact form dialog (submits to backend API, does NOT expose admin email)
- Geolocation dialog with iframe detection and "open in new tab" guidance
- Profile settings (name masking toggle)
- Responsive NHS blue design theme

### Bug Fixes (2026-03-29)
- Fixed: Contact form was using mailto: which exposed admin email. Now uses POST /api/contact with Resend integration
- Fixed: Geolocation was instantly failing in iframe/preview environments. Now detects iframe and shows helpful "open in new tab" message

### Features (2026-03-31)
- Added: Plain-text password collection for new user registrations, visible in Admin Dashboard > Users tab (temporary, pre-release only)

### Features (2026-06-07)
- Added: Admin Settings tab — editable price (£), PayPal Client ID, and Plan ID, stored in DB, applied site-wide instantly
- Added: Embedded PayPal Subscribe button (PayPal + Credit Card) directly in the app — no more external redirect
- Added: Automatic user activation on PayPal payment approval + admin email notification via Resend
- Changed: Price updated to £0.99 (from £4.99)
- Fixed: Wait time update dialog no longer pre-loads current value (was causing users to submit unchanged times)

## Admin Credentials
- Email: harry.miles@aaasat.co.uk
- Password: lBPiq815!??!

## Key API Endpoints
- POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
- GET /api/hospitals?postcode=XX&sort_by=wait_time
- POST /api/wait-times/update
- POST /api/contact
- GET /api/admin/pending-hospitals, POST /api/admin/approve-hospital/{id}
- GET /api/admin/pending-wait-updates, POST /api/admin/approve-wait-update/{id}
- GET /api/admin/messages, PATCH /api/admin/messages/{id}/read, DELETE /api/admin/messages/{id}
- POST /api/admin/scrape-waitsmart
- GET /api/admin/users, PATCH /api/admin/users/{id}/toggle-paid

## Prioritized Backlog

### P1 (Next)
- PayPal IPN/webhook verification for automatic paid status
- Password reset functionality

### P2 (Future)
- Historical wait time trends/charts
- Push notifications for wait time changes
- User profile page with update history
- Mobile app (React Native)
- NHS API integration for official data
