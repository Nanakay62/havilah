lines = open('public/index.html').readlines()[:973]
lines.extend([
    '  <script src="/js/auth.js"></script>\n',
    '  <script>\n',
    '    function handleCta(role) {\n',
    '      const tokenPayload = Auth.parseToken();\n',
    '      if (!tokenPayload) { window.location.href = "/login.html?redirect=" + role; return; }\n',
    '      if (role === "employee" && tokenPayload.role === "employee") window.location.href = "/app/dashboard.html";\n',
    '      else if (role === "hr_admin" && (tokenPayload.role === "hr_admin" || tokenPayload.role === "tenant_admin")) window.location.href = "/portal/hr.html";\n',
    '      else if (tokenPayload.isSystemSuperAdmin) window.location.href = "/super-admin.html";\n',
    '      else window.location.href = "/login.html?redirect=" + role;\n',
    '    }\n',
    '    window.App = { navigate: function(view) { if(view==="employee") handleCta("employee"); if(view==="hr") handleCta("hr_admin"); }, startTrial: function() { window.location.href="/login.html"; }, bookDemo: function() { window.location.href="/login.html"; } };\n',
    '  </script>\n',
    '</body>\n',
    '</html>\n'
])
open('public/index.html', 'w').writelines(lines)
