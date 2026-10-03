"""Verify the public preview without authenticating or creating cloud data.

Run against an already running Expo web server:
  python scripts/verify_web.py --url http://localhost:8087
Requires playwright==1.63.0 and its Chromium headless shell.
"""
import argparse
import json
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://localhost:8087')
parser.add_argument('--output', default='verification/web')
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
report = {'routes': [], 'sizes': [], 'page_errors': [], 'console_errors': []}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = context.new_page()
    page.on('pageerror', lambda error: report['page_errors'].append(str(error)))
    page.on('console', lambda message: report['console_errors'].append(message.text) if message.type == 'error' else None)
    page.goto(args.url, wait_until='networkidle')
    expect(page.get_by_text('La próxima historia', exact=False)).to_be_visible()
    expect(page.get_by_text('6 lugares', exact=True)).to_be_visible()
    expect(page.frame_locator('iframe').locator('.leaflet-marker-icon')).to_have_count(6, timeout=20000)
    page.screenshot(path=str(output / 'explorar-desktop.png'))

    search = page.get_by_role('textbox', name='Buscar un lugar')
    search.fill('lluvia')
    expect(page.get_by_text('1 lugar', exact=True)).to_be_visible()
    expect(page.get_by_text('El silencio después de la lluvia', exact=True)).to_be_visible()
    search.fill('una búsqueda que no existe')
    expect(page.get_by_text('0 lugares', exact=True)).to_be_visible()
    search.fill('')
    page.get_by_role('button', name='Naturaleza', exact=True).click()
    expect(page.get_by_text('3 lugares', exact=True)).to_be_visible()
    page.get_by_role('button', name='Todos', exact=True).click()
    page.get_by_role('button', name='Sorpréndeme', exact=True).click()
    expect(page).to_have_url(re.compile(r'/place/demo-'))
    expect(page.get_by_text('LUGAR DE EJEMPLO', exact=True)).to_be_visible()
    page.screenshot(path=str(output / 'detalle-desktop.png'))
    report['routes'].append('random destination + detail')

    for path in ['/publish', '/saved', '/activity', '/profile', '/premium', '/auth']:
        page.goto(args.url + path, wait_until='networkidle')
        expect(page.get_by_text('Vista previa', exact=True)).to_be_visible()
        assert 'Volvamos al camino.' not in page.locator('body').inner_text(), path
        page.screenshot(path=str(output / (path[1:] + '-desktop.png')))
        report['routes'].append(path)

    page.get_by_role('button', name='Crear mi cuenta', exact=True).click()
    expect(page.get_by_text('Escribe tu nombre, con al menos 2 caracteres.', exact=True)).to_be_visible()
    page.get_by_role('textbox', name='Tu nombre').fill('Prueba local')
    page.get_by_role('textbox', name='Correo electrónico').fill('sin-correo')
    page.get_by_role('button', name='Crear mi cuenta', exact=True).click()
    expect(page.get_by_text('Escribe un correo electrónico válido.', exact=True)).to_be_visible()
    page.get_by_role('button', name='Iniciar sesión', exact=True).click()
    expect(page.get_by_text('Bienvenido al camino.', exact=True)).to_be_visible()
    report['routes'].append('auth validation without cloud writes')

    for width, height in [(320, 740), (390, 844), (768, 1024), (1440, 1000)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.goto(args.url, wait_until='networkidle')
        expect(page.get_by_text('La próxima historia', exact=False)).to_be_visible()
        metrics = page.evaluate('({width: innerWidth, scrollWidth: document.documentElement.scrollWidth})')
        assert metrics['scrollWidth'] <= width + 1, metrics
        page.screenshot(path=str(output / f'explorar-{width}.png'))
        page.get_by_role('tab', name='Perfil', exact=True).click()
        expect(page.get_by_text('Cada aventura empieza contigo.', exact=True)).to_be_visible()
        page.screenshot(path=str(output / f'perfil-{width}.png'))
        report['sizes'].append({'width': width, 'height': height, 'horizontal_overflow': False})
    browser.close()

(output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
assert not report['page_errors'], report['page_errors']
assert not report['console_errors'], report['console_errors']
print(json.dumps(report, ensure_ascii=False, indent=2))
