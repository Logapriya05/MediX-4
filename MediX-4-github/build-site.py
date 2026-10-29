# Builds medix4-site.html: one self-contained page (code, styles, model inlined).
import base64, glob, subprocess
subprocess.run(['npx', 'vite', 'build', '--config', 'vite.single.config.js'], check=True, capture_output=True)
js = open(glob.glob('dist-single/assets/*.js')[0]).read()
css = open(glob.glob('dist-single/assets/*.css')[0]).read()
glb = base64.b64encode(open('public/ambulance.glb', 'rb').read()).decode()
assert '</script' not in js
html = f'''<meta charset="utf-8">
<title>MEDIX-4 Ambulance</title>
<meta name="theme-color" content="#07080a">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root {{ color-scheme: dark; }}
html, body {{ height: 100%; background: #07080a; color: #eef1f3; }}
{css}
</style>
<div id="root"></div>
<script>window.__MEDIX_MODEL__ = "data:model/gltf-binary;base64,{glb}";</script>
<script type="module">
{js}
</script>
'''
open('medix4-site.html', 'w').write(html)
print('ok', round(len(html) / 1e6, 2), 'MB')
