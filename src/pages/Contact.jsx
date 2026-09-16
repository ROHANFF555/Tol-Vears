import LegalPage from './LegalPage.jsx';

export default function Contact() {
  return (
    <LegalPage
      title="Contact"
      description="Contact the independent ToolsHub team with questions, feedback, or suggestions for new browser tools."
    >
      <p>
        Have feedback, found a problem, or have an idea for a useful tool? We would love to hear
        from you.
      </p>
      <p>
        Email us at{' '}
        <a
          href="mailto:contact@tol-vears.onrender.com"
          className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
        >
          contact@tol-vears.onrender.com
        </a>
        . Please include the page or tool you are writing about so we can respond more helpfully.
      </p>
    </LegalPage>
  );
}
