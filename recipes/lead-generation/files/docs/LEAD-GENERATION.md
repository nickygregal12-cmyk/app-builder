# Lead generation

The enquiry form uses Netlify Forms and includes the static `public/__forms.html` definition required for a React-rendered form to be detected at build time. The client submits to `/__forms.html` and includes a honeypot field.

Enable form detection for the Netlify project before expecting submissions in the Netlify Forms dashboard. Configure email, Slack or webhook notifications in Netlify rather than hard-coding credentials into this repository.
