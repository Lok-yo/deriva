"""Auxiliary UI fixtures: static exported assets, no server and no Supabase writes.

This does not test a physical GPS, camera, biometric reader, payment or Realtime.
Every Supabase HTTP request and WebSocket is intercepted locally by Playwright.
"""
import argparse
import base64
import json
import mimetypes
import re
import time
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--static-directory', type=Path, default=Path('verification/dark-export'))
parser.add_argument('--output', type=Path, default=Path('verification/publication-fixtures'))
args = parser.parse_args()
static_root = args.static_directory.resolve()
assert (static_root / 'index.html').is_file(), 'Exported index.html is not ready'
args.output.mkdir(parents=True, exist_ok=True)
app_url = 'https://deriva-fixture.test'
fixture_uid = '12000000-0000-4000-8000-000000000001'
supabase_url = next(line.partition('=')[2].strip().strip('\"\'') for line in Path('.env').read_text().splitlines()
                    if line.startswith('EXPO_PUBLIC_SUPABASE_URL='))
supabase_host = urlparse(supabase_url).hostname
storage_key = f'sb-{supabase_host.split(".")[0]}-auth-token'
report = {'scope': 'Auxiliary exported UI with local Auth/REST fixtures; no physical sensors or real payments tested',
          'checks': [], 'supabase_requests_mocked': [], 'supabase_websockets_mocked': 0,
          'unexpected_requests_blocked': [], 'page_errors': [], 'console_errors': []}

def fixture_session():
    expiry = int(time.time()) + 3600
    def b64(value):
        return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip('=')
    token = '.'.join([b64({'alg': 'HS256', 'typ': 'JWT'}),
                      b64({'sub': fixture_uid, 'role': 'authenticated', 'aud': 'authenticated', 'exp': expiry}),
                      'local-fixture-signature'])
    user = {'id': fixture_uid, 'aud': 'authenticated', 'role': 'authenticated',
            'email': 'deriva-ui-fixture@example.invalid', 'email_confirmed_at': '2026-10-04T00:00:00Z',
            'app_metadata': {'provider': 'email', 'providers': ['email']},
            'user_metadata': {'full_name': 'Deriva UI Fixture'}, 'identities': [],
            'created_at': '2026-10-04T00:00:00Z', 'updated_at': '2026-10-04T00:00:00Z'}
    return {'access_token': token, 'refresh_token': 'local-fixture-refresh-token',
            'token_type': 'bearer', 'expires_in': 3600, 'expires_at': expiry, 'user': user}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    def context_for(role='normal', signed_in=True):
        context = browser.new_context(viewport={'width': 390, 'height': 844})
        session = fixture_session()
        if signed_in:
            context.add_init_script('if (window.top === window) localStorage.setItem(' + json.dumps(storage_key) + ',' + json.dumps(json.dumps(session)) + ');')

        def route_request(route):
            parsed = urlparse(route.request.url)
            if parsed.hostname == 'deriva-fixture.test':
                path = unquote(parsed.path).lstrip('/')
                target = (static_root / path).resolve()
                if not target.is_relative_to(static_root):
                    route.abort()
                    return
                if not target.is_file():
                    if Path(path).suffix:
                        route.fulfill(status=404, body='Not found')
                        return
                    target = static_root / 'index.html'
                route.fulfill(path=str(target), content_type=mimetypes.guess_type(str(target))[0] or 'application/octet-stream')
                return
            if parsed.hostname == supabase_host or (parsed.hostname or '').endswith('.supabase.co'):
                method, path = route.request.method, parsed.path
                report['supabase_requests_mocked'].append({'role': role, 'method': method, 'path': path})
                headers = {'access-control-allow-origin': app_url, 'access-control-allow-headers': '*',
                           'access-control-allow-methods': 'GET,POST,OPTIONS', 'content-type': 'application/json'}
                if method == 'OPTIONS':
                    route.fulfill(status=204, headers=headers)
                    return
                payload = None
                known = True
                if path == '/auth/v1/token' and method == 'POST':
                    payload = session
                elif path == '/auth/v1/user' and method == 'GET':
                    payload = session['user']
                elif path == '/rest/v1/rpc/deriva_get_access' and method == 'POST':
                    payload = {'is_admin': role == 'admin', 'remote_credits': 0, 'visits': 0 if role == 'normal' else 3, 'required_visits': 3}
                elif path == '/rest/v1/deriva_profiles' and method == 'GET':
                    payload = [{'user_id': fixture_uid, 'display_name': 'Deriva UI Fixture', 'created_at': '2026-10-04T00:00:00Z'}]
                elif path in ['/rest/v1/deriva_places', '/rest/v1/deriva_saved_places', '/rest/v1/deriva_notifications',
                              '/rest/v1/deriva_notification_preferences', '/rest/v1/deriva_place_visits'] and method == 'GET':
                    payload = []
                else:
                    known = False
                if not known:
                    report['unexpected_requests_blocked'].append({'method': method, 'path': path})
                    route.fulfill(status=403, headers=headers, body=json.dumps({'message': 'Blocked by local UI fixture; no external mutation allowed'}))
                else:
                    route.fulfill(status=200, headers=headers, body=json.dumps(payload))
                return
            route.continue_()

        context.route('**/*', route_request)

        def websocket_fixture(ws):
            report['supabase_websockets_mocked'] += 1
            # Do not connect_to_server: no Supabase WebSocket can leave the process.
            def receive(message):
                if not isinstance(message, str):
                    return
                try:
                    data = json.loads(message)
                    if isinstance(data, list) and len(data) == 5 and data[3] in ['phx_join', 'heartbeat']:
                        response = {'postgres_changes': []} if data[3] == 'phx_join' else {}
                        ws.send(json.dumps([data[0], data[1], data[2], 'phx_reply', {'status': 'ok', 'response': response}]))
                except (ValueError, TypeError):
                    pass
            ws.on_message(receive)
        context.route_web_socket('**/*', websocket_fixture)
        page = context.new_page()
        page.on('pageerror', lambda error: report['page_errors'].append(str(error)))
        page.on('console', lambda message: report['console_errors'].append(message.text) if message.type == 'error' else None)
        return context, page

    try:
        context, page = context_for()
        page.goto(app_url + '/publish', wait_until='networkidle')
        title = page.get_by_role('textbox', name='Título', exact=True)
        expect(title).to_be_visible()
        publish = page.get_by_role('button', name='Publicar lugar', exact=True)
        expect(publish).to_be_enabled()
        expect(page.get_by_role('button', name='Elegir de galería', exact=True)).to_have_count(0)
        expect(page.get_by_text(re.compile(r'^Categor[ií]a(s)?$', re.IGNORECASE))).to_have_count(0)
        publish.click()
        expect(page.get_by_text('Escribe un título de entre 3 y 80 caracteres.', exact=True)).to_be_visible()
        title.fill('Lugar de prueba UI')
        publish.click()
        expect(page.get_by_text('Añade una fotografía antes de publicar.', exact=True)).to_be_visible()
        expect(publish).to_be_enabled()
        page.screenshot(path=str(args.output / 'local-photo-validation.png'), full_page=True)
        report['checks'].extend(['Authenticated local CTA enabled with empty fields', 'Missing title explained',
                                 'Missing photo explained after valid title', 'Local gallery and categories absent'])
        context.close()

        remote_path = '/publish?mode=remote&latitude=32.44527&longitude=-114.78945'
        context, page = context_for(role='admin')
        page.goto(app_url + remote_path, wait_until='networkidle')
        expect(page.get_by_text('Administrador · Este punto es gratis.', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Elegir de galería', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Publicar lugar', exact=True)).to_be_enabled()
        expect(page.get_by_role('button', name=re.compile(r'Pagar.*USD'))).to_have_count(0)
        expect(page.get_by_text('32.44527, -114.78945', exact=True).filter(visible=True)).to_be_visible()
        page.screenshot(path=str(args.output / 'admin-remote-controls.png'), full_page=True)
        report['checks'].append('Remote admin fixture has gallery and enabled publication without payment CTA')
        context.close()

        context, page = context_for()
        page.goto(app_url + remote_path, wait_until='networkidle')
        expect(page.get_by_text('0/3 lugares visitados', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Ver mi exploración', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name=re.compile(r'Pagar.*USD'))).to_have_count(0)
        expect(page.get_by_role('button', name='Publicar lugar', exact=True)).to_have_count(0)
        page.screenshot(path=str(args.output / 'normal-remote-locked.png'), full_page=True)
        report['checks'].append('Remote fixture without three visits is locked and offers no payment')
        context.close()

        context, page = context_for(role='explorer')
        page.goto(app_url + remote_path, wait_until='networkidle')
        expect(page.get_by_role('button', name='Pagar 1 USD · Prueba', exact=True)).to_be_visible()
        expect(page.get_by_text('Exploración completada · Para agregar una ubicación nueva en este punto debes pagar 1 USD.', exact=True)).to_be_visible()
        expect(page.get_by_text('Stripe en modo de prueba. No se cobran importes reales.', exact=True)).to_be_visible()
        expect(page.get_by_role('button', name='Publicar lugar', exact=True)).to_have_count(0)
        expect(page.get_by_role('button', name='Elegir de galería', exact=True)).to_be_visible()
        page.screenshot(path=str(args.output / 'normal-remote-payment.png'), full_page=True)
        report['checks'].append('Remote explorer fixture displays one USD test payment and no unpaid publication CTA')
        context.close()

        context, page = context_for(role='explorer', signed_in=False)
        page.goto(app_url + remote_path, wait_until='networkidle')
        page.get_by_role('button', name='Crear cuenta o iniciar sesión', exact=True).click()
        expect(page).to_have_url(re.compile(r'/auth\?'))
        auth_params = parse_qs(urlparse(page.url).query)
        assert auth_params['mode'] == ['remote'] and auth_params['latitude'] == ['32.44527'] and auth_params['longitude'] == ['-114.78945']
        page.get_by_role('button', name='Iniciar sesión', exact=True).click()
        page.get_by_role('textbox', name='Correo electrónico', exact=True).fill('deriva-ui-fixture@example.invalid')
        page.get_by_label('Contraseña', exact=True).fill('Local-fixture-only-123')
        page.get_by_role('button', name='Entrar a Deriva', exact=True).click()
        expect(page).to_have_url(re.compile(r'/publish\?'))
        after_params = parse_qs(urlparse(page.url).query)
        assert after_params['mode'] == ['remote'] and after_params['latitude'] == ['32.44527'] and after_params['longitude'] == ['-114.78945']
        expect(page.get_by_text('32.44527, -114.78945', exact=True).filter(visible=True)).to_be_visible()
        expect(page.get_by_role('button', name='Pagar 1 USD · Prueba', exact=True)).to_be_visible()
        report['checks'].append('Mocked sign-in returns to remote publication and preserves coordinates')
        context.close()
        assert not report['unexpected_requests_blocked'], report['unexpected_requests_blocked']
        assert not report['page_errors'], report['page_errors']
        report['passed'] = True
    except Exception as error:
        report['passed'] = False
        report['failure'] = str(error)
        try:
            page.screenshot(path=str(args.output / 'failure.png'), full_page=True)
            (args.output / 'failure-dom.txt').write_text(page.locator('body').inner_text())
        except Exception:
            pass
        raise
    finally:
        browser.close()
        (args.output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')

print(json.dumps({'passed': report['passed'], 'checks': report['checks'],
                  'mocked_http_count': len(report['supabase_requests_mocked']),
                  'mocked_websocket_count': report['supabase_websockets_mocked'],
                  'unexpected_requests': len(report['unexpected_requests_blocked']),
                  'page_errors': report['page_errors']}, ensure_ascii=False, indent=2))
