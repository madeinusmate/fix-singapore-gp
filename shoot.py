from playwright.sync_api import sync_playwright
U='http://127.0.0.1:4173/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    errs=[]
    for name,view,vp in [('current','current',(1440,900)),('redesign_A','redesign_A',(1440,900)),('overlay','overlay',(1440,900)),('mobile_390x844','redesign_B',(390,844))]:
        pg=b.new_page(viewport={'width':vp[0],'height':vp[1]},device_scale_factor=2 if vp[0]<500 else 1)
        pg.on('console',lambda m: m.type=='error' and errs.append(m.text)); pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(U+'#view='+view); pg.wait_for_selector('.leaflet-tile-loaded',timeout=30000); pg.wait_for_timeout(4000)
        pg.screenshot(path=f'/workspace/sgp-app/shots/{name}.png')
    print('errors',errs)
