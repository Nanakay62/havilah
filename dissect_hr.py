import re

with open('private/portal/hr.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Nav links: Keep only HR Analytics
html = re.sub(
    r'<nav class="nav" role="navigation" aria-label="Primary">.*?</nav>',
    '<nav class="nav" role="navigation" aria-label="Primary"><button class="nav-item active">HR Analytics</button></nav>',
    html,
    flags=re.DOTALL
)

# 2. Remove Landing View
html = re.sub(r'<!-- ============ LANDING VIEW ============ -->.*?</section>\n</section>', '', html, count=1, flags=re.DOTALL)

# 3. Remove Employee View
html = re.sub(r'<!-- ============ EMPLOYEE VIEW ============ -->.*?</section>', '', html, count=1, flags=re.DOTALL)

# 4. Make sure view-hr doesn't have style="display:none"
html = html.replace('<section class="view" id="view-hr"', '<section class="view active" id="view-hr" style="display:block;"')

with open('private/portal/hr.html', 'w', encoding='utf-8') as f:
    f.write(html)
