# MGT Scheduling

**Staff shift scheduling for a working restaurant.**

## What this is

A manager-facing web app that plans the weekly staff schedule of Me Gustas Tú,
a restaurant in Corralejo, Fuerteventura: employee roster with roles and
working patterns, day-off and holiday requests, an auto-generator that fills
the week's shifts while respecting roles, preferences, and requests, a swap
mode for moving staff between shifts, and a PDF export with a completeness
guard.

- **Screenshots of every major feature:** [pz-my-page.vercel.app](https://pz-my-page.vercel.app/)
- **Status:** in active development, 124+ commits
- Sister app to [MGT Bookings](https://github.com/pzzychowicz-blip/megustastu-bookings)
  (the same restaurant's reservation system, in production), sharing its
  design system, Firebase architecture, and process conventions.

## Who uses it

The restaurant's manager, to plan each week's front-of-house and kitchen
shifts. I work front-of-house at the same restaurant, so the scheduling
rules in the app are the ones the operation actually runs on.

## What I did

Sole developer and owner. Like MGT Bookings, this is built AI-natively:
I direct AI coding tools (primarily Claude Code) through planning, specs,
execution, and review, with conventional engineering discipline around it.

Highlights:

- **Modelled the restaurant's real staffing rules:** sections (Front of
  House, Kitchen), five roles, day/evening shift templates, per-section
  staffing needs by day part.
- **Built an auto-generator** that fills the weekly schedule from those
  rules, honouring each employee's roles, shift preferences, working days,
  and approved requests.
- **Scheduled configuration changes:** settings take effect from a chosen
  week, so historical schedules stay accurate.
- **Export guard:** the PDF export warns about unfilled shifts before
  generating, so an incomplete rota never reaches the wall.
- **Process discipline carried over from Bookings:** Git with versioning,
  dev/prod Firebase separation, documented refactor log.

## Stack

React 19 · Vite · Firebase Realtime Database + Auth · Vercel

## Development

```bash
npm install
npm run dev     # local dev server against the dev Firebase project
npm run build   # production build
```
