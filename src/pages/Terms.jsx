import LegalPage from './LegalPage.jsx';

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Use"
      description="ToolsHub terms of use: a free browser-based service provided without warranties and used at your own risk."
    >
      <p>
        ToolsHub provides free, browser-based utilities for general informational and convenience
        purposes. You may use the site as long as you comply with applicable laws and these terms.
      </p>
      <p>
        The service is provided free of charge and “as is,” without warranties of any kind. We do
        not guarantee that every tool will always be available, error-free, or suitable for a
        particular purpose. Use the results and any downloaded files at your own risk, and keep
        your own backups of important material.
      </p>
      <p>
        Because the tools run in your browser, you are responsible for your device, browser, files,
        and the decisions you make using the results. To the extent permitted by law, ToolsHub and
        its independent creator are not liable for loss or damage resulting from use of the site.
      </p>
      <p>
        We may update these terms as ToolsHub grows. Continuing to use the site after an update
        means you accept the revised terms.
      </p>
    </LegalPage>
  );
}
