import { invoke } from '@tauri-apps/api/core'

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  isSymlink: boolean
  size: number
  modified: number | null
  kind: string
  extension: string
  hidden: boolean
}
export interface Place { id: string; name: string; path: string }
export interface Bootstrap { home: string; username: string; places: Place[]; volumes: Place[] }
export interface Preview { previewType: 'image' | 'text' | 'unavailable'; content: string; truncated: boolean }

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const demoHome = '/Users/guest'
const demoFiles: FileEntry[] = [
  {name:'Projects',path:demoHome+'/Projects',isDir:true,isSymlink:false,size:0,modified:1792422200,kind:'Folder',extension:'',hidden:false},
  {name:'Photography',path:demoHome+'/Photography',isDir:true,isSymlink:false,size:0,modified:1792335800,kind:'Folder',extension:'',hidden:false},
  {name:'Design Assets',path:demoHome+'/Design Assets',isDir:true,isSymlink:false,size:0,modified:1792249400,kind:'Folder',extension:'',hidden:false},
  {name:'Screenshots',path:demoHome+'/Screenshots',isDir:true,isSymlink:false,size:0,modified:1792163000,kind:'Folder',extension:'',hidden:false},
  {name:'Brand Guidelines.pdf',path:demoHome+'/Brand Guidelines.pdf',isDir:false,isSymlink:false,size:4081000,modified:1792422200,kind:'PDF Document',extension:'pdf',hidden:false},
  {name:'mountain-sunrise.jpg',path:demoHome+'/mountain-sunrise.jpg',isDir:false,isSymlink:false,size:8247300,modified:1792335800,kind:'Image',extension:'jpg',hidden:false},
  {name:'Q4 Roadmap.xlsx',path:demoHome+'/Q4 Roadmap.xlsx',isDir:false,isSymlink:false,size:187520,modified:1792249400,kind:'Spreadsheet',extension:'xlsx',hidden:false},
  {name:'website-launch.mov',path:demoHome+'/website-launch.mov',isDir:false,isSymlink:false,size:428120030,modified:1792076600,kind:'Video',extension:'mov',hidden:false},
  {name:'Meeting notes.md',path:demoHome+'/Meeting notes.md',isDir:false,isSymlink:false,size:2390,modified:1792163000,kind:'Text Document',extension:'md',hidden:false},
  {name:'app-design.fig',path:demoHome+'/app-design.fig',isDir:false,isSymlink:false,size:29102930,modified:1791903800,kind:'FIG File',extension:'fig',hidden:false},
]
const demoBootstrap: Bootstrap = {
  home: demoHome, username: 'guest',
  places: [
    {id:'home',name:'Home',path:demoHome},
    {id:'desktop',name:'Desktop',path:demoHome+'/Desktop'},
    {id:'documents',name:'Documents',path:demoHome+'/Documents'},
    {id:'downloads',name:'Downloads',path:demoHome+'/Downloads'},
    {id:'pictures',name:'Pictures',path:demoHome+'/Pictures'},
    {id:'music',name:'Music',path:demoHome+'/Music'},
    {id:'movies',name:'Movies',path:demoHome+'/Movies'},
    {id:'applications',name:'Applications',path:'/Applications'},
  ],
  volumes: [{id:'root',name:'Macintosh HD',path:'/'}]
}
export async function boot(): Promise<Bootstrap> { return isTauri ? invoke('bootstrap') : demoBootstrap }
export async function listDirectory(path: string, showHidden: boolean): Promise<FileEntry[]> {
  if (isTauri) return invoke('list_directory', { path, showHidden })
  if (path === demoHome) return demoFiles.filter(i => showHidden || !i.hidden)
  if (path === '/' || path === '/Users') return [{name:'guest',path:demoHome,isDir:true,isSymlink:false,size:0,modified:null,kind:'Folder',extension:'',hidden:false}]
  return demoFiles.filter(i => i.path.startsWith(path+'/') && !i.path.slice(path.length + 1).includes('/'))
}
export async function searchFiles(root: string, query: string, showHidden: boolean): Promise<FileEntry[]> {
  if (isTauri) return invoke('search_files', {root, query, showHidden})
  return demoFiles.filter(i => i.path.startsWith(root) && i.name.toLowerCase().includes(query.toLowerCase()))
}
export async function createFolder(parent: string, name: string): Promise<string> { return invoke('create_folder', {parent, name}) }
export async function renameItem(path: string, newName: string): Promise<string> { return invoke('rename_item', {path, newName}) }
export async function transferItems(paths: string[], destination: string, cut: boolean): Promise<number> { return invoke('transfer_items', {paths, destination, cut}) }
export async function trashItems(paths: string[]): Promise<number> { return invoke('trash_items', {paths}) }
export async function openItem(path: string, reveal = false): Promise<void> { return invoke('open_item', {path, reveal}) }
export async function quickLook(path: string): Promise<void> { return invoke('quick_look', {path}) }
export async function readPreview(path: string): Promise<Preview> { return invoke('read_preview', {path}) }
export function basename(path: string): string { return path === '/' ? 'Macintosh HD' : path.split('/').filter(Boolean).at(-1) || 'Home' }
export function parentPath(path: string): string { if (path === '/') return '/'; return path.slice(0, path.lastIndexOf('/')) || '/' }
export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  const units = ['KB', 'MB', 'GB', 'TB']; let n = size; let i = -1
  do { n /= 1024; i++ } while (n >= 1024 && i < units.length - 1)
  return `${n >= 10 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`
}
export function formatDate(seconds: number | null): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
}

export interface LargeFile {
  name: string
  path: string
  size: number
  modified: number | null
  category: string
  extension: string
}
export interface SpaceCategory { name: string; bytes: number; count: number }
export interface ScanReport {
  root: string
  scannedFiles: number
  scannedBytes: number
  matchingFiles: number
  matchingBytes: number
  unreadable: number
  limited: boolean
  driveTotal: number | null
  driveAvailable: number | null
  categories: SpaceCategory[]
  files: LargeFile[]
}
const demoLarge: LargeFile[] = [
  ['Vela-launch-final.mov','Movies',6.4,'Videos','mov'],
  ['Archive-2025.dmg','Downloads',3.8,'Archives','dmg'],
  ['Project-backup.zip','Documents',2.7,'Archives','zip'],
  ['Camera-footage-01.mp4','Movies',2.3,'Videos','mp4'],
  ['RAW-session.arw','Pictures',1.6,'Images','arw'],
  ['Campaign-edit.psd','Pictures',1.2,'Images','psd'],
  ['Brand-assets.zip','Downloads',0.94,'Archives','zip'],
  ['Pitch-deck.pdf','Documents',0.61,'Documents','pdf'],
  ['Podcast-master.wav','Music',0.37,'Audio','wav'],
  ['Installer-old.pkg','Downloads',0.21,'Archives','pkg'],
  ['Studio-retouch.tif','Pictures',0.15,'Images','tif'],
  ['Render-preview.mov','Movies',0.13,'Videos','mov'],
].map(([name,dir,gib,category,extension],i)=>({name:String(name),path:`${demoHome}/${dir}/${name}`,size:Math.round(Number(gib)*1073741824),modified:1792401000 - i*86400,category:String(category),extension:String(extension)}))
export async function scanSpace(root: string, minSizeMb: number, includeHidden: boolean): Promise<ScanReport> {
  if(isTauri) return invoke('scan_space',{root,minSizeMb,includeHidden})
  await new Promise(resolve=>setTimeout(resolve,900))
  const files=demoLarge.filter(f=>f.size>=minSizeMb*1024*1024).filter(f=>root===demoHome || f.path.startsWith(root+'/'))
  const cats=new Map<string,SpaceCategory>()
  for(const f of demoLarge.filter(f=>root===demoHome || f.path.startsWith(root+'/'))){
    const old=cats.get(f.category)||{name:f.category,bytes:0,count:0}
    old.bytes+=f.size;old.count++;cats.set(f.category,old)
  }
  return {root,scannedFiles:demoLarge.length+24738,scannedBytes:demoLarge.reduce((n,f)=>n+f.size,0)+18.3*1073741824,
    matchingFiles:files.length,matchingBytes:files.reduce((n,f)=>n+f.size,0),
    unreadable:0,limited:false,driveTotal:512*1073741824,driveAvailable:182.6*1073741824,
    categories:[...cats.values()].sort((a,b)=>b.bytes-a.bytes),files}
}

export async function trashScannedFiles(files: LargeFile[]): Promise<number> { return invoke('trash_scanned_files',{files}) }
