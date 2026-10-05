"""Verify the auxiliary web version without creating cloud data.

Run against the Expo Go development server:
  python scripts/verify_web.py --url http://localhost:8081
Or use exported assets without starting any server:
  python scripts/verify_web.py --static-directory verification/fixes-export
Requires playwright==1.63.0 and Chromium. Browser geolocation is a fixture;
this does not verify a native map or a physical phone's GPS.
"""
import argparse
import json
import mimetypes
import re
from pathlib import Path
from urllib.parse import unquote, urlparse
from playwright.sync_api import sync_playwright, expect

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://localhost:8081')
parser.add_argument('--output', default='verification/redesign-web')
parser.add_argument('--static-directory', type=Path)
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
report = {'routes': [], 'sizes': [], 'map_interactions': [], 'page_errors': [], 'console_errors': [], 'supabase_warnings': []}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={'width': 390, 'height': 844},
        geolocation={'latitude': 32.465, 'longitude': -114.77, 'accuracy': 25},
        permissions=['geolocation'],
    )
    if args.static_directory:
        static_root = args.static_directory.resolve()
        assert (static_root / 'index.html').is_file(), 'Missing exported index.html'
        args.url = 'https://deriva.test'

        def exported_asset(route):
            path = unquote(urlparse(route.request.url).path).lstrip('/')
            target = (static_root / path).resolve()
            if not target.is_relative_to(static_root):
                route.abort()
                return
            if not target.is_file():
                if Path(path).suffix:
                    route.fulfill(status=404, body='Not found')
                    return
                target = static_root / 'index.html'
            content_type = mimetypes.guess_type(str(target))[0] or 'application/octet-stream'
            route.fulfill(path=str(target), content_type=content_type)

        context.route(args.url + '/**', exported_asset)
    page = context.new_page()
    page.on('pageerror', lambda error: report['page_errors'].append(str(error)))
    page.on('console', lambda message: report['console_errors'].append(message.text) if message.type == 'error' else None)
    page.on('console', lambda message: report['supabase_warnings'].append(message.text) if message.type == 'warning' and ('gotrue' in message.text.lower() or 'supabase' in message.text.lower()) else None)
    page.goto(args.url, wait_until='networkidle')
    home = page.get_by_test_id('map-screen').filter(visible=True)
    expect(home).to_be_visible()
    expect(page.get_by_role('tab')).to_have_count(3)
    for label in ['Mapa', 'Publicar', 'Perfil']:
        expect(page.get_by_role('tab', name=label, exact=True)).to_be_visible()
    expect(page.get_by_role('button', name='Ver ejemplos en San Luis Río Colorado', exact=True)).to_have_count(0)
    frame_element = home.locator('iframe').element_handle()
    frame = home.frame_locator('iframe')
    expect(frame.locator('.pin')).to_have_count(6, timeout=20000)
    expect(frame.locator('.origin')).to_have_count(1)
    map_bounds = home.locator('iframe').bounding_box()
    assert map_bounds, 'Map has no visible area'
    assert frame.locator('.pin').all_text_contents() == ['?'] * 6
    # The initial camera follows GPS; sample places may correctly be offscreen.
    page.get_by_role('button', name='Elegir un lugar al azar', exact=True).click()
    selected = page.get_by_test_id('selected-place').filter(visible=True)
    expect(selected).to_be_visible()
    assert page.evaluate('(frame) => frame.isConnected', frame_element), 'Selecting a pin rebuilt the iframe'
    page.get_by_role('button', name='Cerrar lugar seleccionado', exact=True).click()
    expect(selected).to_have_count(0)
    # Random selection centers one real marker. Tapping that marker must keep
    # the same map document and must not open the empty-point payment prompt.
    visible_pin = next(pin for pin in frame.locator('.pin').all() if (bounds := pin.bounding_box())
                       and map_bounds['x'] <= bounds['x'] <= map_bounds['x'] + map_bounds['width'] - bounds['width']
                       and map_bounds['y'] <= bounds['y'] <= map_bounds['y'] + map_bounds['height'] - bounds['height'])
    visible_pin.click()
    expect(selected).to_be_visible()
    expect(page.get_by_test_id('new-point-prompt')).to_have_count(0)
    selected.get_by_role('button', name=re.compile(r'^Ver ')).click()
    expect(page).to_have_url(re.compile(r'/place/demo-'))
    expect(page.get_by_text(re.compile(r'^LUGAR DE EJEMPLO'))).to_have_count(0)
    expect(page.get_by_role('button', name='Abrir navegación', exact=True)).to_have_count(0)
    expect(page.get_by_role('button', name='Ver lugar en OpenStreetMap', exact=True)).to_have_count(0)
    expect(page.get_by_role('button', name=re.compile(r'GPS'))).to_be_visible()
    page.screenshot(path=str(output / 'detalle-390.png'))
    expect(page.get_by_role('tab')).to_have_count(0)
    report['routes'].append('map marker + random selection + example detail')
    report['map_interactions'].append('Selecting a place preserves the map iframe')

    page.goto(args.url, wait_until='networkidle')
    home = page.get_by_test_id('map-screen').filter(visible=True)
    frame = home.frame_locator('iframe')
    expect(frame.locator('.pin')).to_have_count(6, timeout=20000)
    frame.locator('#map').click(position={'x': 90, 'y': 220})
    prompt = page.get_by_test_id('new-point-prompt')
    expect(prompt).to_be_visible()
    expect(prompt.get_by_text('Agregar una ubicación aquí cuesta 1 USD.', exact=True)).to_be_visible()
    page.screenshot(path=str(output / 'punto-remoto-390.png'))
    prompt.get_by_role('button', name='Iniciar sesión para continuar', exact=True).click()
    expect(page).to_have_url(re.compile(r'/publish\?.*mode=remote'))
    report['map_interactions'].append('Empty map point offers one remote publication for 1 USD')

    for path in ['/publish', '/saved', '/activity', '/profile', '/premium', '/auth']:
        page.goto(args.url + path, wait_until='networkidle')
        expect(page.get_by_role('tab')).to_have_count(3 if path in ['/publish', '/profile', '/premium'] else 0)
        if path == '/premium':
            expect(page).to_have_url(args.url + '/')
        assert 'Volvamos al camino.' not in page.locator('body').inner_text(), path
        report['routes'].append(path)

    page.get_by_role('button', name='Crear mi cuenta', exact=True).click()
    expect(page.get_by_text('Escribe tu nombre, con al menos 2 caracteres.', exact=True)).to_be_visible()
    page.get_by_role('textbox', name='Tu nombre').fill('Prueba local')
    page.get_by_role('textbox', name='Correo electrónico').fill('sin-correo')
    page.get_by_role('button', name='Crear mi cuenta', exact=True).click()
    expect(page.get_by_text('Escribe un correo electrónico válido.', exact=True)).to_be_visible()
    report['routes'].append('auth validation without cloud writes')

    for width, height in [(320, 740), (390, 844), (768, 1024), (1440, 1000)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.goto(args.url, wait_until='networkidle')
        home = page.get_by_test_id('map-screen').filter(visible=True)
        expect(home).to_be_visible()
        expect(home.frame_locator('iframe').locator('.pin')).to_have_count(6, timeout=20000)
        bounds = home.locator('iframe').bounding_box()
        assert bounds and bounds['height'] >= height * 0.7, bounds
        metrics = page.evaluate('({width: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: innerHeight, scrollHeight: document.documentElement.scrollHeight})')
        assert metrics['scrollWidth'] <= width + 1, metrics
        assert metrics['scrollHeight'] <= height + 1, metrics
        page.screenshot(path=str(output / f'mapa-{width}.png'))
        page.get_by_role('tab', name='Perfil', exact=True).click()
        expect(page).to_have_url(re.compile(r'/profile'))
        expect(page.get_by_role('button', name=re.compile(r'Guardados', re.IGNORECASE))).to_have_count(0)
        expect(page.get_by_role('button', name=re.compile(r'Premium', re.IGNORECASE))).to_have_count(0)
        expect(page.get_by_role('button', name=re.compile(r'Actividad', re.IGNORECASE))).to_be_visible()
        page.screenshot(path=str(output / f'perfil-{width}.png'))
        report['sizes'].append({'width': width, 'height': height, 'map_height': round(bounds['height']), 'overflow': False})
    browser.close()

(output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
assert not report['page_errors'], report['page_errors']
assert not report['console_errors'], report['console_errors']
assert not report['supabase_warnings'], report['supabase_warnings']
print(json.dumps(report, ensure_ascii=False, indent=2))
