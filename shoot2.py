from playwright.sync_api import sync_playwright
U='http://127.0.0.1:4173/'
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    errs=[]
    for name,h,vp in [('v2_redesign_A2_2d','view=redesign_A2&mode=2d',(1440,900)),('v2_redesign_A2_3d','view=redesign_A2&mode=3d',(1440,900)),('v2_overlay','view=overlay&mode=2d',(1440,900)),('v2_mobile_390x844','view=redesign_A2&mode=2d',(390,844))]:
        pg=b.new_page(viewport={'width':vp[0],'height':vp[1]},device_scale_factor=2 if vp[0]<500 else 1)
        pg.on('console',lambda m: m.type=='error' and errs.append(m.text)); pg.on('pageerror',lambda e: errs.append(str(e)))
        pg.goto(U+'#'+h); pg.wait_for_selector('.maplibregl-canvas',timeout=30000); pg.wait_for_timeout(9000)
        pg.screenshot(path=f'/workspace/sgp-app/shots/{name}.png')
    print('errors',errs[:10])
