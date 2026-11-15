from pathlib import Path
import json,hashlib,datetime,os,subprocess,concurrent.futures,importlib.metadata,sys
from PIL import Image,__version__ as pillow_version
import zxingcpp
if len(sys.argv) != 2: raise SystemExit('Usage: python scripts/validate-svg-output.py OUTPUT_DIRECTORY')
root=Path(sys.argv[1]).resolve()
production=json.loads((root/'production-results.json').read_text())
def check(item):
 row={'id':item['id'],'requested_level':item['requestedLevel'],'svg_sha256':item.get('sha256')}
 if not item.get('exported'):return {**row,'passed':False,'reason':'producer/export refused'}
 src=root/item['filename'];target=src.with_suffix('.raster.png')
 if hashlib.sha256(src.read_bytes()).hexdigest() != item['sha256']:
  return {**row,'passed':False,'reason':'SVG bytes differ from production record'}
 env=os.environ.copy();env['INKSCAPE_PROFILE_DIR']=str(root/'profiles'/item['id']);env['XDG_CACHE_HOME']=str(root/'caches'/item['id'])
 try:
  p=subprocess.run(['inkscape',str(src),'--export-type=png','--export-area-page','--export-filename='+str(target)],env=env,capture_output=True,text=True,timeout=30)
  row.update(rasterizer_exit=p.returncode,rasterizer_stderr=p.stderr,raster_file=str(target.relative_to(root)))
  if p.returncode: return {**row,'passed':False}
  row['raster_sha256']=hashlib.sha256(target.read_bytes()).hexdigest()
  with Image.open(target) as im:
   row['dimensions']=list(im.size);decoded=zxingcpp.read_barcode(im.convert('RGB'),formats=zxingcpp.BarcodeFormat.QRCode,text_mode=zxingcpp.TextMode.Plain)
  row['decoder_found']=decoded is not None
  if decoded is None:return {**row,'passed':False}
  row.update(valid=decoded.valid,raw_hex=decoded.bytes.hex(),text=decoded.text,error_correction_level=decoded.ec_level,bytes_equal=decoded.bytes==bytes.fromhex(item['expectedHex']),text_equal=decoded.text==item['payload'])
  row['passed']=bool(decoded.valid and row['bytes_equal'] and row['text_equal'] and decoded.ec_level==item['requestedLevel'])
 except Exception as e:row.update(passed=False,error=type(e).__name__+': '+str(e))
 return row
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:rows=list(pool.map(check,production['results']))
version_env={**os.environ,'INKSCAPE_PROFILE_DIR':str(root/'profiles'/'version'),'XDG_CACHE_HOME':str(root/'caches'/'version')}
report={'source':production['source'],'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'node':production['node'],'rasterizer':subprocess.run(['inkscape','--version'],capture_output=True,text=True,check=True,env=version_env).stdout.strip() + ', page export at default96dpi','decoder':'zxing-cpp'+importlib.metadata.version('zxing-cpp'),'pillow':pillow_version,'total':len(rows),'passed':sum(r['passed'] for r in rows),'results':rows,'scope':'Actual final SVG bytes independently rasterized then QR decoded; exact selected UTF8 bytes/text and L/M/Q/H. No browser/accessibility, arbitrary artwork, animation or production qualification.'}
(root/'independent-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'total':report['total'],'passed':report['passed'],'failures':[r for r in rows if not r['passed']]}))

if report['total'] != 12 or report['passed'] != 12: raise SystemExit(1)
