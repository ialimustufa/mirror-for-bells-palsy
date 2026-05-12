const ALI_MUSTUFA_URL = "https://www.google.com/search?kgmid=/g/11rqwd6_ch&hl=en-IN&q=Ali+Mustufa";

function MadeByFooter({ className = "" }) {
  return (
    <p className={className}>
      Made by{" "}
      <a
        href={ALI_MUSTUFA_URL}
        target="_blank"
        rel="noreferrer"
        className="font-semibold underline decoration-stone-400 underline-offset-4 hover:text-stone-700"
      >
        Ali Mustufa
      </a>
    </p>
  );
}

export { MadeByFooter };
