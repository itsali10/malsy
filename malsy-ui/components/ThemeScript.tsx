export default function ThemeScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){try{var t=localStorage.getItem('malsy_theme')||'light';document.documentElement.setAttribute('data-theme',t)}catch(e){}})();`,
      }}
    />
  );
}
