import { Link } from 'react-router-dom'

const CONTACT = 'support@miu.digital'

const Page = ({ title, children }) => (
  <article className="legal">
    <p className="kicker">Fix Singapore GP</p>
    <h1>{title}</h1>
    <p className="updated">Last updated 12 October 2026</p>
    {children}
    <p className="legal-links">
      <Link to="/terms">Terms</Link>
      <Link to="/privacy">Privacy</Link>
      <Link to="/">Back to the leaderboard</Link>
    </p>
  </article>
)

export const TermsPage = () => (
  <Page title="Terms and conditions">
    <p>
      Fix Singapore GP is a site for drawing laps of Marina Bay, publishing them to the leaderboard, and upvoting other layouts. These terms cover use of the site.
    </p>

    <h2>Accounts</h2>
    <p>
      Publishing a new layout and upvoting other layouts need a Google account. Creating an account means you accept these terms, the <Link to="/privacy">privacy policy</Link>, and that Fix Singapore GP may send you marketing communications. To stop those messages, email <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
    </p>

    <h2>Layouts you publish</h2>
    <p>
      A published layout is public. Its name, path, lap figures, and your Google display name appear on the leaderboard and on its page. A picture of the 3D view is public as well, in link previews and in marketing email. You can edit or delete a layout you published, and deleting it removes that picture. You keep what you drew, and you let Fix Singapore GP store it and show it for as long as it stays published.
    </p>
    <p>
      Publish a layout of this circuit. Don&apos;t publish anything unlawful, or use the site to harass someone. We can remove a layout or close an account that breaks these terms.
    </p>

    <h2>Upvotes</h2>
    <p>
      One account can upvote a layout once, and can take that upvote back. Votes decide the order of the leaderboard.
    </p>

    <h2>The lap sim</h2>
    <p>
      Lap times and the overtaking index come from a point-mass model of the 2026 rules. They are for comparing layouts. They are not a prediction of a race. This site is not affiliated with Formula 1 or the Singapore Grand Prix.
    </p>

    <h2>Contact</h2>
    <p>
      Questions about these terms: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
    </p>
  </Page>
)

export const PrivacyPage = () => (
  <Page title="Privacy">
    <p>
      This page says what Fix Singapore GP stores when you use the site, and why.
    </p>

    <h2>If you only browse</h2>
    <p>
      You can look at the current lap, the leaderboard, and a published layout without an account. A draft you draw stays in this browser until you publish it or clear it. We don&apos;t receive that draft.
    </p>
    <p>
      The site records the pages you open and actions such as sharing a layout or driving it. Rheo stores that, with a random id kept in this browser. Creating an account also sends your email address to Rheo so marketing messages can be sent.
    </p>

    <h2>If you create an account</h2>
    <p>
      Sign-in uses Google, through Firebase Authentication. Google gives us your account id, display name, and email address. We show the display name next to layouts you publish. We don&apos;t show your email on the site.
    </p>
    <p>
      Creating an account is your agreement to receive marketing communications from Fix Singapore GP. Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> and we will stop.
    </p>

    <h2>Layouts and upvotes</h2>
    <p>A published layout stores:</p>
    <ul>
      <li>its name, racing sense, colour, waypoints, path, and thumbnail</li>
      <li>a public picture of the 3D view</li>
      <li>the lap summary from the sim</li>
      <li>your account id and display name</li>
      <li>when it was created and last updated, and its upvote count</li>
    </ul>
    <p>
      An upvote stores your account id and the time you voted, on that layout. Only you can read which layouts you have upvoted. The count on the layout is public.
    </p>

  
    <h2>How long we keep it</h2>
    <p>
      A layout, its 3D picture, and its upvotes stay until you delete the layout, or until we remove it. Your sign-in record stays with Firebase until the account is removed. Email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> to ask us to delete your account data.
    </p>

    <h2>Contact</h2>
    <p>
      Privacy questions: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.
    </p>
  </Page>
)
