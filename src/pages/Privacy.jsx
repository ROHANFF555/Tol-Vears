import LegalPage from './LegalPage.jsx';

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      description="ToolsHub privacy policy: our browser tools run client-side, and files are never uploaded or stored on a server."
    >
      <p>
        ToolsHub is built around privacy. All of our tools run 100% client-side in your browser.
        The files and data you choose to work with are processed on your device; they are never
        uploaded to or stored on any ToolsHub server.
      </p>
      <p>
        ToolsHub currently does not use analytics or advertising, and the site does not require an
        account or signup. The only local browser storage currently used is an optional preference
        for light or dark mode. That preference stays on your device.
      </p>
      <p>
        If analytics or ads are introduced in the future, we will update this policy before doing
        so to explain what information is collected, why it is used, and which third parties may
        provide those services. The tools themselves will continue to be designed to process your
        files in your browser.
      </p>
      <p>
        If you have a privacy question, please contact us through the email address on our Contact
        page.
      </p>
    </LegalPage>
  );
}
