// MessFlow mark: white "M" over a two-tone green disc (traced from the brand logo).
// viewBox is 0 0 100 100; the disc fills it, so callers decide the background.
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>
<linearGradient id="l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5cc13f"/><stop offset=".55" stop-color="#109a49"/><stop offset="1" stop-color="#0b8a42"/></linearGradient>
<linearGradient id="d" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#065c35"/><stop offset="1" stop-color="#03482a"/></linearGradient>
<clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath>
</defs>
<g clip-path="url(#c)">
<rect width="100" height="100" fill="url(#l)"/>
<path d="M23 31 L49.5 57.5 L88 19 L110 19 L110 110 L23 110 Z" fill="url(#d)"/>
<path d="M23 105 V31 L49.5 57.5 L88 19" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="miter" stroke-miterlimit="10"/>
<path d="M73 52 L79 46 V105 H73 Z" fill="#fff"/>
</g>
</svg>`;

export const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;
