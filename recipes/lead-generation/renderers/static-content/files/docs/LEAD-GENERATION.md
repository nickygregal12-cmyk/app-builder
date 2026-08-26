# Lead generation

The enquiry form is rendered into the page at build time, so it is present in the
document a visitor receives rather than created after an application boots. That
has two practical consequences:

- **It works without JavaScript.** The form posts to `/__forms.html` the ordinary
  way. The inline script on the page only upgrades that to a background
  submission so the visitor stays where they are and gets an answer in the live
  region beside the button. If the script does not run, the form still submits.
- **Netlify detects it directly.** `public/__forms.html` is still shipped, and the
  rendered form carries `data-netlify="true"`, a hidden `form-name` and a
  honeypot field.

Enable form detection for the Netlify project before expecting submissions in the
Netlify Forms dashboard. Configure email, Slack or webhook notifications in
Netlify rather than hard-coding credentials into this repository.

Where a different host or a serverless endpoint is used instead, change the
form's `action` and the deployment configuration. The renderer is not the
backend authority: nothing under `src/` other than that one address knows where
an enquiry goes.
