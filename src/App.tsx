import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type DragEvent } from 'react'
import {
  Activity, AppWindow, ArrowDownAZ, ArrowLeft, ArrowRight, ArrowUp,
  Check, CheckCheck, ChevronDown, ChevronRight, Clipboard, Code2, Command,
  Copy, Download, Ellipsis, ExternalLink, File, FileArchive, FileAudio, FileImage,
  FileSpreadsheet, FileText, FileVideo, Film, Folder, FolderHeart, FolderOpen,
  FolderPlus, Grid2X2, HardDrive, Home, Image, Info, Keyboard, LayoutGrid,
  List as ListIcon, LoaderCircle, Monitor, Moon, Music, PanelRight, Pencil,
  Pin, Plus, RefreshCw, Search, Scissors, Sun, Trash2, X, Sparkles, ScanSearch,
  type LucideIcon
} from 'lucide-react'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import SpaceCleaner from './SpaceCleaner'
import {
  basename, boot, createFolder, formatDate, formatSize, isTauri, listDirectory,
  openItem, parentPath, quickLook, readPreview, renameItem, searchFiles, transferItems, trashItems,
  type Bootstrap, type FileEntry, type Preview
} from './api'

type Tab = { id:number; path:string; back:string[]; forward:string[] }
type ViewMode = 'details' | 'grid'
type SortKey = 'name' | 'modified' | 'size' | 'kind'
type Modal = { type:'new' | 'rename' | 'trash'; target?:FileEntry }
type Toast = { id:number; message:string; error?:boolean }
type Menu = 'new' | 'sort' | 'more' | null

const placeIcon: Record<string,LucideIcon> = {
  home:Home, desktop:Monitor, documents:FileText, downloads:Download,
  pictures:Image, music:Music, movies:Film, applications:AppWindow, root:HardDrive
}

function iconFor(item:FileEntry):LucideIcon {
  if(item.isDir) return Folder
  if(item.kind === 'Image') return FileImage
  if(item.kind === 'Video') return FileVideo
  if(item.kind === 'Audio') return FileAudio
  if(item.kind === 'Source Code') return Code2
  if(item.kind === 'Archive') return FileArchive
  if(item.kind === 'Spreadsheet') return FileSpreadsheet
  if(item.kind === 'Document' || item.kind === 'Text Document' || item.kind === 'PDF Document') return FileText
  return File
}
function toneFor(item:FileEntry) {
  if(item.isDir) return 'folder'
  if(item.kind === 'Image') return 'image'
  if(item.kind === 'Video') return 'video'
  if(item.kind === 'Audio') return 'audio'
  if(item.kind === 'PDF Document') return 'pdf'
  if(item.kind === 'Archive') return 'archive'
  if(item.kind === 'Spreadsheet') return 'sheet'
  if(item.kind === 'Source Code') return 'code'
  return 'file'
}
function Glyph({item,large=false}:{item:FileEntry;large?:boolean}) {
  const I=iconFor(item)
  return <span className={`file-glyph glyph-${toneFor(item)} ${large?'large':''}`}><I size={large?36:21} strokeWidth={large?1.7:1.8} /></span>
}
function Action({icon:Icon,label,onClick,disabled=false,active=false,shortcut}:{icon:LucideIcon;label:string;onClick:()=>void;disabled?:boolean;active?:boolean;shortcut?:string}){
  return <button type="button" className={`command-action ${active?'active':''}`} disabled={disabled} onClick={onClick} title={shortcut?`${label} (${shortcut})`:label}>
    <Icon size={17} strokeWidth={1.8}/><span>{label}</span>
  </button>
}
function persistPins(pins:string[]) { try { localStorage.setItem('vela:pins', JSON.stringify(pins)) } catch { /* preferences optional */ } }
function readPins():string[] { try {const x=JSON.parse(localStorage.getItem('vela:pins')||'[]');return Array.isArray(x)?x.filter((p):p is string=>typeof p==='string'):[]}catch{return []} }

export default function App(){
  const [bootData,setBootData]=useState<Bootstrap|null>(null)
  const [tabs,setTabs]=useState<Tab[]>([{id:1,path:'',back:[],forward:[]}])
  const [activeId,setActiveId]=useState(1)
  const nextTab=useRef(2)
  const active=tabs.find(t=>t.id===activeId)||tabs[0]
  const currentPath=active?.path||''
  const [items,setItems]=useState<FileEntry[]>([])
  const [loading,setLoading]=useState(false)
  const [refreshCount,setRefreshCount]=useState(0)
  const [selected,setSelected]=useState<Set<string>>(new Set())
  const [lastSelected,setLastSelected]=useState<string|null>(null)
  const [clipboard,setClipboard]=useState<{paths:string[];cut:boolean}|null>(null)
  const [showHidden,setShowHidden]=useState(false)
  const [view,setView]=useState<ViewMode>('details')
  const [sort,setSort]=useState<SortKey>('name')
  const [ascending,setAscending]=useState(true)
  const [search,setSearch]=useState('')
  const [addressEdit,setAddressEdit]=useState(false)
  const [addressText,setAddressText]=useState('')
  const [inspector,setInspector]=useState(true)
  const [preview,setPreview]=useState<Preview|null>(null)
  const [menu,setMenu]=useState<Menu>(null)
  const [context,setContext]=useState<{x:number;y:number;entry:FileEntry|null}|null>(null)
  const [modal,setModal]=useState<Modal|null>(null)
  const [modalText,setModalText]=useState('')
  const [busy,setBusy]=useState(false)
  const [toasts,setToasts]=useState<Toast[]>([])
  const [pins,setPins]=useState<string[]>(readPins)
  const [dark,setDark]=useState(false)
  const [glass,setGlass]=useState(true)
  const [workspaceMode,setWorkspaceMode]=useState<'explorer'|'cleaner'>('explorer')
  const searchRef=useRef<HTMLInputElement>(null)
  const addressRef=useRef<HTMLInputElement>(null)
  const pendingReq=useRef(0)

  const toast=useCallback((message:string,error=false)=>{
    const id=Date.now()+Math.random()
    setToasts(old=>[...old.slice(-2),{id,message,error}])
    window.setTimeout(()=>setToasts(old=>old.filter(t=>t.id!==id)),3700)
  },[])
  const onError=useCallback((error:unknown)=>toast(String(error),true),[toast])

  useEffect(()=>{
    let alive=true
    boot().then(data=>{
      if(!alive)return
      setBootData(data)
      setTabs([{id:1,path:data.home,back:[],forward:[]}])
    }).catch(onError)
    return()=>{alive=false}
  },[onError])

  const navigate=useCallback((path:string,addHistory=true)=>{
    if(!path)return
    setTabs(old=>old.map(t=>t.id===activeId?{
      ...t,path,back:addHistory&&t.path&&t.path!==path?[...t.back,t.path]:t.back,
      forward:addHistory?[]:t.forward
    }:t))
    setSelected(new Set());setLastSelected(null);setSearch('');setMenu(null);setContext(null);setAddressEdit(false)
  },[activeId])
  const historyMove=(dir:'back'|'forward')=>{
    setTabs(old=>old.map(t=>{
      if(t.id!==activeId)return t
      if(dir==='back'&&!t.back.length)return t
      if(dir==='forward'&&!t.forward.length)return t
      const from=dir==='back'?t.back:t.forward
      const dest=dir==='back'?t.forward:t.back
      const path=from.at(-1)!
      return {...t,path, [dir]:from.slice(0,-1),[dir==='back'?'forward':'back']:[...dest,t.path]}
    }))
    setSelected(new Set());setLastSelected(null);setSearch('');setContext(null)
  }
  const addTab=()=>{
    const id=nextTab.current++
    setTabs(old=>[...old,{id,path:currentPath||bootData?.home||'/',back:[],forward:[]}]);setActiveId(id)
    setSelected(new Set());setSearch('')
  }
  const closeTab=(id:number)=>{
    if(tabs.length<=1){navigate(bootData?.home||'/');return}
    const idx=tabs.findIndex(t=>t.id===id)
    const remaining=tabs.filter(t=>t.id!==id)
    setTabs(remaining)
    if(activeId===id){setActiveId(remaining[Math.max(0,idx-1)].id);setSelected(new Set());setSearch('')}
  }
  useEffect(()=>{if(!currentPath)return
    const id=++pendingReq.current
    setLoading(true)
    const timer=window.setTimeout(()=>{
      const request=search.trim()?searchFiles(currentPath,search.trim(),showHidden):listDirectory(currentPath,showHidden)
      request.then(result=>{if(pendingReq.current===id)setItems(result)})
        .catch(error=>{if(pendingReq.current===id){setItems([]);onError(error)}})
        .finally(()=>{if(pendingReq.current===id)setLoading(false)})
    },search.trim()?360:0)
    return()=>{clearTimeout(timer);pendingReq.current++}
  },[currentPath,showHidden,search,refreshCount,onError])

  const sorted=useMemo(()=>[...items].sort((a,b)=>{
    if(a.isDir!==b.isDir)return a.isDir?-1:1
    let n=0
    if(sort==='name')n=a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'})
    if(sort==='kind')n=a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name)
    if(sort==='modified')n=(a.modified||0)-(b.modified||0)
    if(sort==='size')n=a.size-b.size
    return (ascending?1:-1)*n
  }),[items,sort,ascending])
  const chosen=sorted.filter(f=>selected.has(f.path))
  const single=chosen.length===1?chosen[0]:null
  const folderCount=items.filter(i=>i.isDir).length
  const totalSize=items.filter(i=>!i.isDir).reduce((n,i)=>n+i.size,0)
  const isHome=currentPath===bootData?.home&&!search.trim()

  useEffect(()=>{
    let alive=true
    setPreview(null)
    if(!single||single.isDir||!isTauri)return
    readPreview(single.path).then(value=>{if(alive)setPreview(value)}).catch(()=>{if(alive)setPreview(null)})
    return()=>{alive=false}
  },[single?.path,single?.isDir])

  const refresh=()=>setRefreshCount(i=>i+1)
  const choose=(event:MouseEvent,entry:FileEntry)=>{
    const modifier=event.metaKey||event.ctrlKey
    if(event.shiftKey&&lastSelected){
      const first=sorted.findIndex(f=>f.path===lastSelected)
      const end=sorted.findIndex(f=>f.path===entry.path)
      if(first>=0&&end>=0){setSelected(new Set(sorted.slice(Math.min(first,end),Math.max(first,end)+1).map(f=>f.path)));return}
    }
    setSelected(old=>{
      if(!modifier)return new Set([entry.path])
      const next=new Set(old);if(next.has(entry.path))next.delete(entry.path);else next.add(entry.path);return next
    })
    setLastSelected(entry.path)
  }
  const enter=(entry:FileEntry)=>{if(entry.isDir)navigate(entry.path);else if(isTauri)openItem(entry.path).catch(onError);else toast('File opening is available in the installed Mac app.')}
  const actionSelection=(entry?:FileEntry|null)=>entry?[entry.path]:chosen.map(i=>i.path)
  const copyToClipboard=(cut:boolean,entry?:FileEntry|null)=>{
    const paths=actionSelection(entry)
    if(!paths.length)return
    setClipboard({paths,cut});setMenu(null);setContext(null)
    toast(`${cut?'Ready to move':'Copied'} ${paths.length} item${paths.length!==1?'s':''}. Navigate and paste.`)
  }
  const paste=async(destination=currentPath,clip=clipboard)=>{
    if(!clip?.paths.length)return
    if(!isTauri){toast('File operations work in the macOS app, not browser preview.');return}
    try{
      setBusy(true)
      const count=await transferItems(clip.paths,destination,clip.cut)
      if(clip.cut)setClipboard(null)
      toast(`${count} item${count===1?'':'s'} ${clip.cut?'moved':'copied'} successfully`)
      refresh()
    }catch(e){onError(e);refresh()}finally{setBusy(false)}
  }
  const ask=(type:Modal['type'],target?:FileEntry|null)=>{
    if(type!=='new'&&!target&&!single)return
    setModal({type,target:target||single||undefined});setModalText(type==='rename'?(target||single)?.name||'':'New folder')
    setMenu(null);setContext(null)
  }
  const commitModal=async(e:FormEvent)=>{
    e.preventDefault()
    if(!modal)return
    if(!isTauri){toast('This is a visual preview. Run the app on macOS to manage real files.');setModal(null);return}
    setBusy(true)
    try{
      if(modal.type==='new'){
        if(!modalText.trim())return
        await createFolder(currentPath,modalText)
        toast(`Created “${modalText}”`)
      } else if(modal.type==='rename'&&modal.target){
        await renameItem(modal.target.path,modalText)
        toast('Item renamed')
      } else if(modal.type==='trash'){
        const paths=modal.target?[modal.target.path]:chosen.map(f=>f.path)
        await trashItems(paths);toast(`Moved ${paths.length} item${paths.length===1?'':'s'} to Trash`)
      }
      setModal(null);setSelected(new Set());refresh()
    }catch(error){onError(error)}finally{setBusy(false)}
  }
  const togglePin=(path:string)=>{
    const next=pins.includes(path)?pins.filter(p=>p!==path):[...pins,path]
    setPins(next);persistPins(next);setContext(null);toast(pins.includes(path)?'Removed from Quick access':'Pinned to Quick access')
  }
  const changeSort=(s:SortKey)=>{if(sort===s)setAscending(v=>!v);else {setSort(s);setAscending(s==='name'||s==='kind')}setMenu(null)}
  const reveal=(entry:FileEntry)=>{if(isTauri)openItem(entry.path,true).catch(onError);else toast('Available in the Mac app.')}
  const previewNative=(entry:FileEntry)=>{if(isTauri)quickLook(entry.path).catch(onError);else toast('Quick Look is available in the Mac app.')}
  const duplicate=async(entry?:FileEntry|null)=>{
    const paths=actionSelection(entry)
    if(!paths.length)return
    if(!isTauri){toast('Duplication is available in the Mac app.');return}
    setBusy(true)
    try {const n=await transferItems(paths,currentPath,false);toast(`Duplicated ${n} item${n===1?'':'s'}`);refresh()}
    catch(e){onError(e);refresh()}
    finally{setBusy(false)}
  }
  const showContext=(e:MouseEvent,entry:FileEntry|null)=>{
    e.preventDefault()
    if(entry&&!selected.has(entry.path)){setSelected(new Set([entry.path]));setLastSelected(entry.path)}
    setContext({x:Math.min(e.clientX,window.innerWidth-216),y:Math.min(e.clientY,window.innerHeight-330),entry});setMenu(null)
  }
  const onStartDrag=(event:DragEvent,entry:FileEntry)=>{
    const paths=selected.has(entry.path)?Array.from(selected):[entry.path]
    event.dataTransfer.setData('application/x-vela-paths',JSON.stringify(paths))
    event.dataTransfer.effectAllowed='copyMove'
  }
  const onDrop=(event:DragEvent,destination:string)=>{
    event.preventDefault();event.stopPropagation()
    const raw=event.dataTransfer.getData('application/x-vela-paths')
    if(!raw)return
    try{
      const paths=JSON.parse(raw) as string[]
      if(!Array.isArray(paths)||!paths.length)return
      // Drag defaults to copy; hold Shift when dropping to move, protecting original data.
      void paste(destination,{paths,cut:event.shiftKey})
    }catch{toast('Unable to read dragged items.',true)}
  }
  const dropProps=(destination:string)=>({
    onDragOver:(e:DragEvent)=>{if(e.dataTransfer.types.includes('application/x-vela-paths'))e.preventDefault()},
    onDrop:(e:DragEvent)=>onDrop(e,destination)
  })
  const chooseFolder=async()=>{
    if(!isTauri){toast('Native folder picker available in the Mac app.');return}
    try{const folder=await openDialog({directory:true,multiple:false,title:'Open a folder in Vela'});if(typeof folder==='string')navigate(folder)}catch(e){onError(e)}
  }

  useEffect(()=>{
    const onDown=(event:KeyboardEvent)=>{
      const target=event.target as HTMLElement
      if(target.closest('input, textarea, [contenteditable="true"]')){
        if(event.key==='Escape'){(target as HTMLInputElement).blur();setAddressEdit(false);setSearch('')}
        return
      }
      if(modal){if(event.key==='Escape')setModal(null);return}
      const cmd=event.metaKey||event.ctrlKey
      const key=event.key.toLowerCase()
      if(cmd&&key==='t'){event.preventDefault();addTab()}
      else if(cmd&&key==='w'){event.preventDefault();closeTab(activeId)}
      else if(cmd&&key==='l'){event.preventDefault();setAddressText(currentPath);setAddressEdit(true)}
      else if(cmd&&key==='f'){event.preventDefault();searchRef.current?.focus()}
      else if(cmd&&event.shiftKey&&key==='n'){event.preventDefault();ask('new')}
      else if(cmd&&key==='a'){event.preventDefault();setSelected(new Set(sorted.map(f=>f.path)))}
      else if(cmd&&key==='c'){event.preventDefault();copyToClipboard(false)}
      else if(cmd&&key==='x'){event.preventDefault();copyToClipboard(true)}
      else if(cmd&&key==='v'){event.preventDefault();void paste()}
      else if(cmd&&key==='r'){event.preventDefault();refresh()}
      else if(cmd&&key==='d'&&chosen.length){event.preventDefault();void duplicate()}
      else if(cmd&&key==='i'){event.preventDefault();setInspector(v=>!v)}
      else if(cmd&&key==='o'&&single){event.preventDefault();enter(single)}
      else if(cmd&&event.shiftKey&&key==='.'){event.preventDefault();setShowHidden(v=>!v)}
      else if(cmd&&key==='backspace'){event.preventDefault();ask('trash')}
      else if(key==='f2'){event.preventDefault();ask('rename')}
      else if(event.key==='Backspace'&&!cmd){event.preventDefault();navigate(parentPath(currentPath))}
      else if(cmd&&event.key==='['){event.preventDefault();historyMove('back')}
      else if(cmd&&event.key===']'){event.preventDefault();historyMove('forward')}
      else if(event.key===' '&&single){event.preventDefault();previewNative(single)}
      else if(event.key==='Escape'){setContext(null);setMenu(null);setSelected(new Set())}
      else if(event.key==='Enter'&&single){event.preventDefault();enter(single)}
    }
    window.addEventListener('keydown',onDown)
    return()=>window.removeEventListener('keydown',onDown)
  })
  useEffect(()=>{if(addressEdit)addressRef.current?.focus()},[addressEdit])
  useEffect(()=>{
    const cb=(e:PointerEvent)=>{if(!(e.target as HTMLElement).closest('[data-menu-root]')){setMenu(null);setContext(null)}}
    document.addEventListener('pointerdown',cb)
    return()=>document.removeEventListener('pointerdown',cb)
  },[])
  const submitAddress=(event:FormEvent)=>{event.preventDefault();const input=addressText.trim();if(input)navigate(input)}

  const places=bootData?.places||[]
  const volumes=bootData?.volumes||[]
  const breadcrumbs=(()=>{
    if(!currentPath)return [] as {label:string;path:string}[]
    const bits=currentPath.split('/').filter(Boolean)
    return [{label:'Macintosh HD',path:'/'},...bits.map((label,i)=>({label,path:'/'+bits.slice(0,i+1).join('/')}))]
  })()
  const navItem=(label:string,path:string,Icon:LucideIcon,id:string,pinned=false)=>
    <button key={id+path} className={`side-item ${currentPath===path?'selected':''}`} onClick={()=>{setWorkspaceMode('explorer');navigate(path)}} title={path}>
      <Icon size={17} strokeWidth={1.8}/><span>{label}</span>{pinned&&<Pin size={12} className="side-pin"/>}
    </button>
  const fileCard=(item:FileEntry)=>{
    const activeFile=selected.has(item.path)
    return <div key={item.path} className={`file-card ${activeFile?'selected':''}`} tabIndex={0} draggable
      onClick={e=>choose(e,item)} onDoubleClick={()=>enter(item)} onContextMenu={e=>showContext(e,item)}
      onKeyDown={e=>{if(e.key==='Enter')enter(item)}} onDragStart={e=>onStartDrag(e,item)} {...(item.isDir?dropProps(item.path):{})}>
      <div className="file-card-visual"><Glyph item={item} large/>{activeFile&&<span className="selected-check"><Check size={12}/></span>}</div>
      <div className="file-card-name" title={item.name}>{item.name}</div>
      <div className="file-card-kind">{item.isDir?'File folder':item.kind}</div>
    </div>
  }
  const tableRow=(item:FileEntry)=>
    <div key={item.path} className={`file-row ${selected.has(item.path)?'selected':''} ${clipboard?.cut&&clipboard.paths.includes(item.path)?'pending-cut':''}`}
      onClick={e=>choose(e,item)} onDoubleClick={()=>enter(item)} onContextMenu={e=>showContext(e,item)}
      draggable onDragStart={e=>onStartDrag(e,item)} {...(item.isDir?dropProps(item.path):{})}>
      <div className="cell name-cell"><Glyph item={item}/><span className="filename" title={item.name}>{item.name}</span>{item.isSymlink&&<span className="alias-dot">↗</span>}</div>
      <div className="cell muted date-cell">{formatDate(item.modified)}</div>
      <div className="cell muted kind-cell">{item.kind}</div>
      <div className="cell muted size-cell">{item.isDir?'—':formatSize(item.size)}</div>
    </div>

  return <div className={`app-shell ${dark?'dark':''} ${glass?'glass-mode':'solid-mode'} ${workspaceMode==='cleaner'?'cleaner-active':''}`}>
    <div className="top-tabs" data-tauri-drag-region>
      <div className="traffic-spacer" data-tauri-drag-region/>
      <div className="app-logo" title="Vela Explorer"><span className="logo-v">V</span></div>
      <div className="tab-track">
        {tabs.map(t=><div key={t.id} className={`tab ${t.id===activeId?'tab-active':''}`} onClick={()=>{setActiveId(t.id);setSearch('');setSelected(new Set())}}>
          <Folder size={14} strokeWidth={2}/><span>{t.path?basename(t.path):'Home'}</span>
          <button className="tab-close" title="Close tab" onClick={e=>{e.stopPropagation();closeTab(t.id)}}><X size={13}/></button>
        </div>)}
        <button title="New tab (⌘T)" className="add-tab" onClick={addTab}><Plus size={17}/></button>
      </div>
      <span className="top-spacer" data-tauri-drag-region/>
      <span className="app-caption">VELA <span>EXPLORER</span></span>
      <button title={glass?'Switch to classic Fluent surfaces':'Enable glass surfaces'} className={`top-icon glass-switch ${glass?'on':''}`} onClick={()=>setGlass(v=>!v)}><Sparkles size={16}/><span>{glass?'Glass':'Classic'}</span></button>
      <button title={dark?'Light appearance':'Dark appearance'} className="top-icon" onClick={()=>setDark(v=>!v)}>{dark?<Sun size={17}/>:<Moon size={17}/>}</button>
    </div>

    <div className="main-layout">
      <aside className="sidebar">
        <div className="sidebar-scroll">
          <div className="side-workspace">
            <div className="workspace-heading">WORKSPACE</div>
            <button className={`workspace-side-button ${workspaceMode==='explorer'?'active':''}`} onClick={()=>setWorkspaceMode('explorer')}><FolderOpen size={17}/><span>File Explorer</span>{workspaceMode==='explorer'&&<i/>}</button>
            <button className={`workspace-side-button cleaner-nav ${workspaceMode==='cleaner'?'active':''}`} onClick={()=>setWorkspaceMode('cleaner')}><ScanSearch size={17}/><span>Space Cleaner</span><span className="cleaner-new">NEW</span></button>
          </div>
          <div className="side-heading"><span>FAVOURITES</span><button title="Add current folder to favourites" onClick={()=>togglePin(currentPath)}><Plus size={15}/></button></div>
          <nav className="sidebar-links">
            {places.filter(p=>['home','desktop','documents','downloads','pictures'].includes(p.id)).map(p=>navItem(p.name,p.path,placeIcon[p.id]||Folder,p.id))}
            {pins.map(path=>navItem(basename(path),path,FolderHeart,'pin',true))}
          </nav>
          <div className="side-heading second-heading"><span>LIBRARY</span></div>
          <nav className="sidebar-links">
            {places.filter(p=>['music','movies','applications'].includes(p.id)).map(p=>navItem(p.name,p.path,placeIcon[p.id]||Folder,p.id))}
          </nav>
          <div className="side-heading second-heading"><span>LOCATIONS</span><button title="Open a folder" onClick={chooseFolder}><Plus size={15}/></button></div>
          <nav className="sidebar-links">
            {volumes.map(p=>navItem(p.name,p.path,HardDrive,p.id))}
          </nav>
          <div className="sidebar-tip">
            <div className="tip-symbol"><Keyboard size={16}/></div>
            <div><strong>A little faster</strong><p>⌘ C / ⌘ V to copy and paste files, ⌘ T for a new tab.</p></div>
          </div>
        </div>
        <div className="sidebar-profile"><div className="avatar">{bootData?.username?.slice(0,1).toUpperCase()||'M'}</div><div className="profile-detail"><strong>{bootData?.username||'Your Mac'}</strong><span>Local workspace</span></div><span className="online-pulse"/></div>
      </aside>

      <div className="workspace">
        {workspaceMode==='cleaner'?<SpaceCleaner home={bootData?.home||'/Users/guest'} onOpenFolder={path=>{setWorkspaceMode('explorer');navigate(path)}} notify={toast}/>:<>
        <div className="navigation-bar">
          <div className="direction-buttons">
            <button disabled={!active?.back.length} title="Back (⌘[)" onClick={()=>historyMove('back')}><ArrowLeft size={19}/></button>
            <button disabled={!active?.forward.length} title="Forward (⌘])" onClick={()=>historyMove('forward')}><ArrowRight size={19}/></button>
            <button disabled={currentPath==='/'} title="Up one level" onClick={()=>navigate(parentPath(currentPath))}><ArrowUp size={19}/></button>
          </div>
          <div className="address-bar" title={currentPath} onDoubleClick={()=>{setAddressText(currentPath);setAddressEdit(true)}}>
            {addressEdit?<form onSubmit={submitAddress} className="address-form"><input ref={addressRef} value={addressText} onChange={e=>setAddressText(e.target.value)} onBlur={()=>setAddressEdit(false)} onKeyDown={e=>{if(e.key==='Escape')setAddressEdit(false)}}/></form>:
            <div className="crumbs"><button className="crumb-root" onClick={()=>navigate(bootData?.home||'/')}><Home size={15}/></button><ChevronRight size={14} className="crumb-separator"/>
              {breadcrumbs.map((crumb,i)=><div className="crumb-item" key={crumb.path}><button className={i===breadcrumbs.length-1?'last':''} onClick={()=>navigate(crumb.path)}>{crumb.label}</button>{i<breadcrumbs.length-1&&<ChevronRight size={14} className="crumb-separator"/>}</div>)}
            </div>}
            {!addressEdit&&<button className="address-edit" title="Edit path (⌘L)" onClick={()=>{setAddressText(currentPath);setAddressEdit(true)}}><ChevronDown size={14}/></button>}
          </div>
          <div className="search-box"><Search size={17} strokeWidth={1.8}/><input ref={searchRef} placeholder={`Search in ${basename(currentPath||'Home')}`} value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button title="Clear search" onClick={()=>setSearch('')}><X size={14}/></button>}</div>
        </div>

        <div className="command-bar">
          <div className="command-left">
            <div className="command-dropdown" data-menu-root>
              <button className={`new-button ${menu==='new'?'active':''}`} onClick={()=>setMenu(menu==='new'?null:'new')}><Plus size={17}/> New <ChevronDown size={12}/></button>
              {menu==='new'&&<div className="popup-menu new-popup"><button onClick={()=>ask('new')}><FolderPlus size={16}/> New folder <span>⇧⌘N</span></button><button onClick={()=>{addTab();setMenu(null)}}><Plus size={16}/> New tab <span>⌘T</span></button><button onClick={()=>{void chooseFolder();setMenu(null)}}><FolderOpen size={16}/> Open folder…</button></div>}
            </div>
            <span className="command-divider"/>
            <Action icon={Scissors} label="Cut" onClick={()=>copyToClipboard(true)} disabled={!chosen.length} shortcut="⌘X"/>
            <Action icon={Copy} label="Copy" onClick={()=>copyToClipboard(false)} disabled={!chosen.length} shortcut="⌘C"/>
            <Action icon={Clipboard} label="Paste" onClick={()=>void paste()} disabled={!clipboard?.paths.length||busy} shortcut="⌘V"/>
            <span className="command-divider"/>
            <Action icon={Pencil} label="Rename" onClick={()=>ask('rename')} disabled={chosen.length!==1} shortcut="F2"/>
            <Action icon={Trash2} label="Delete" onClick={()=>ask('trash')} disabled={!chosen.length} shortcut="⌘⌫"/>
            <span className="command-divider thin-divider"/>
            <div className="command-dropdown" data-menu-root>
              <button className="toolbar-mini" onClick={()=>setMenu(menu==='sort'?null:'sort')}><ArrowDownAZ size={17}/> <span>Sort</span><ChevronDown size={12}/></button>
              {menu==='sort'&&<div className="popup-menu sort-popup">{([['name','Name'],['modified','Date modified'],['kind','Type'],['size','Size']] as [SortKey,string][]).map(([key,label])=><button key={key} onClick={()=>changeSort(key)}>{sort===key?<Check size={16} className="check-blue"/>:<span className="menu-icon-empty"/>}{label}{sort===key&&<span className="menu-trailing">{ascending?'↑':'↓'}</span>}</button>)}</div>}
            </div>
            <button className="toolbar-mini" onClick={()=>setView(view==='details'?'grid':'details')} title="Change view"><Grid2X2 size={17}/><span>View</span><ChevronDown size={12}/></button>
            <div className="command-dropdown" data-menu-root>
              <button className="toolbar-mini dots" title="More options" onClick={()=>setMenu(menu==='more'?null:'more')}><Ellipsis size={21}/></button>
              {menu==='more'&&<div className="popup-menu more-popup"><button onClick={()=>{setShowHidden(v=>!v);setMenu(null)}}>{showHidden?<CheckCheck size={16}/>:<File size={16}/>} {showHidden?'Hide hidden files':'Show hidden files'}</button><button onClick={()=>{refresh();setMenu(null)}}><RefreshCw size={16}/> Refresh <span>⌘R</span></button><button onClick={()=>{void chooseFolder();setMenu(null)}}><FolderOpen size={16}/> Go to folder…</button></div>}
            </div>
          </div>
          <div className="command-right"><button className={`icon-control ${inspector?'pressed':''}`} title={inspector?'Hide details (⌘I)':'Show details (⌘I)'} onClick={()=>setInspector(v=>!v)}><PanelRight size={18}/></button></div>
        </div>

        <div className="content-row">
          <section className="file-content" {...dropProps(currentPath)} onContextMenu={e=>{if(e.target===e.currentTarget)showContext(e,null)}}>
            <div className="folder-header">
              <div><div className="location-eyebrow"><span className="eyebrow-dot"/> {search?'SEARCH RESULTS':'YOUR WORKSPACE'}</div><h1>{search?`Results for “${search}”`:basename(currentPath||'Home')}</h1><p>{search?`Looking inside ${basename(currentPath)}`:isHome?'Everything you need, exactly where you left it.':`Browse and manage your ${basename(currentPath)} files.`}</p></div>
              <div className="folder-header-actions"><button title="Refresh contents" onClick={refresh}><RefreshCw size={17}/></button><button className="header-view" title="Toggle layout" onClick={()=>setView(view==='grid'?'details':'grid')}>{view==='details'?<LayoutGrid size={18}/>:<ListIcon size={18}/>}</button></div>
            </div>
            {!isTauri&&<div className="demo-banner"><Activity size={16}/><span><strong>Interactive design preview</strong> — Sample files are shown. Run the desktop app to access your real Mac folders.</span></div>}
            {isHome&&<div className="quick-section"><div className="section-title"><h2>Quick access</h2><span>YOUR MOST USED LOCATIONS</span></div>
              <div className="quick-grid">{places.filter(p=>['desktop','downloads','documents','pictures'].includes(p.id)).map((p,i)=>{
                const I=placeIcon[p.id]||Folder
                return <button key={p.id} className={`quick-card quick-${i}`} onClick={()=>navigate(p.path)}><span className="quick-icon"><I size={22}/></span><span className="quick-label"><strong>{p.name}</strong><small>Open folder</small></span><ArrowRight size={16} className="quick-arrow"/></button>
              })}</div>
            </div>}
            <div className="files-section">
              <div className="section-title files-title"><h2>{search?'Matching files':isHome?'Your files':'Files & folders'}</h2><div className="section-right"><span>{loading?'Loading…':`${items.length} item${items.length===1?'':'s'}`}</span><button title="Show as list" className={view==='details'?'view-active':''} onClick={()=>setView('details')}><ListIcon size={17}/></button><button title="Show as grid" className={view==='grid'?'view-active':''} onClick={()=>setView('grid')}><Grid2X2 size={16}/></button></div></div>
              {loading?<div className="loading-state"><LoaderCircle className="spin" size={24}/> Reading folder…</div>:
                !sorted.length?<div className="empty-state"><div className="empty-visual"><FolderOpen size={38} strokeWidth={1.4}/></div><strong>{search?'No matching files':'This folder is empty'}</strong><p>{search?'Try another filename or a broader search.':'Create a folder or move files here to get started.'}</p>{!search&&<button onClick={()=>ask('new')}><Plus size={16}/> New folder</button>}</div>:
                view==='details'?<div className="file-list"><div className="list-head"><button className="cell name-cell" onClick={()=>changeSort('name')}>Name {sort==='name'&&<span>{ascending?'↑':'↓'}</span>}</button><button className="cell date-cell" onClick={()=>changeSort('modified')}>Date modified {sort==='modified'&&<span>{ascending?'↑':'↓'}</span>}</button><button className="cell kind-cell" onClick={()=>changeSort('kind')}>Type {sort==='kind'&&<span>{ascending?'↑':'↓'}</span>}</button><button className="cell size-cell" onClick={()=>changeSort('size')}>Size {sort==='size'&&<span>{ascending?'↑':'↓'}</span>}</button></div><div className="file-list-items">{sorted.map(tableRow)}</div></div>
                :<div className="file-grid">{sorted.map(fileCard)}</div>
              }
            </div>
          </section>

          {inspector&&<aside className="details-pane"><div className="details-top"><span>DETAILS</span><button title="Close details" onClick={()=>setInspector(false)}><X size={16}/></button></div>
            {chosen.length>1?<div className="multiple-details"><div className="details-placeholder"><Copy size={36}/></div><h3>{chosen.length} items selected</h3><p>{chosen.filter(x=>x.isDir).length} folders · {chosen.filter(x=>!x.isDir).length} files</p><div className="details-action-grid"><button onClick={()=>copyToClipboard(false)}><Copy size={15}/> Copy</button><button onClick={()=>ask('trash')}><Trash2 size={15}/> Trash</button></div></div>:
              single?<div className="selected-details">
                <div className="preview-box">{preview?.previewType==='image'?<img src={preview.content} alt={`Preview of ${single.name}`}/>:<Glyph item={single} large/>}</div>
                <h3 title={single.name}>{single.name}</h3><p className="details-kind">{single.kind}</p>
                <button className="open-file-button" onClick={()=>enter(single)}>{single.isDir?'Open folder':'Open file'} <ExternalLink size={14}/></button>
                <div className="details-divider"/><div className="details-label">FILE INFORMATION</div>
                <div className="details-rows"><div><span>Type</span><strong>{single.kind}</strong></div><div><span>Size</span><strong>{single.isDir?'—':formatSize(single.size)}</strong></div><div><span>Modified</span><strong>{formatDate(single.modified)}</strong></div><div><span>Extension</span><strong>{single.extension?'.'+single.extension:'—'}</strong></div></div>
                <div className="details-divider"/><div className="details-label">LOCATION</div><div className="details-path" title={single.path}>{parentPath(single.path)}</div>
                {preview?.previewType==='text'&&<><div className="details-divider"/><div className="details-label">TEXT PREVIEW</div><pre className="text-preview">{preview.content.slice(0,1800)}{preview.truncated?'\n…':''}</pre></>}
                <div className="details-bottom-buttons"><button onClick={()=>previewNative(single)}><Info size={15}/> Quick Look</button><button onClick={()=>reveal(single)}><ExternalLink size={15}/> Show in Finder</button><button onClick={()=>togglePin(single.isDir?single.path:parentPath(single.path))}><Pin size={15}/> {pins.includes(single.isDir?single.path:parentPath(single.path))?'Unpin':'Pin folder'}</button></div>
              </div>:
              <div className="no-details"><div className="details-art"><div><FolderOpen size={53} strokeWidth={1.15}/></div><span className="art-orb"/><span className="art-orb second"/></div><h3>Room for the details</h3><p>Select a file or folder to see its information and preview here.</p><div className="details-tip"><Info size={15}/> Tip: Hold ⌘ to select multiple items.</div></div>}
          </aside>}
        </div>

        <div className="statusbar"><div><span className="status-led"/>{loading?'Loading…':`${items.length} items`}{folderCount>0&&<span className="status-extra">· {folderCount} folders</span>}{!search&&<span className="status-extra">· {formatSize(totalSize)} in files</span>}{chosen.length>0&&<strong className="selected-status">{chosen.length} selected</strong>}</div><div className="status-right"><span>{clipboard?`${clipboard.paths.length} ${clipboard.cut?'cut':'copied'} · Ready to paste`:''}</span><span className="status-separator"/><Command size={12}/><span>RUST ENGINE</span><span className="rust-dot"/></div></div>
      </>}
      </div>
    </div>

    {menu&&<div className="menu-screen" onClick={()=>setMenu(null)}/>}
    {context&&<div className="context-menu popup-menu" data-menu-root style={{left:context.x,top:context.y}}>
      {context.entry?<>
        <button onClick={()=>{enter(context.entry!);setContext(null)}}><FolderOpen size={16}/> Open</button>
        <button onClick={()=>{reveal(context.entry!);setContext(null)}}><ExternalLink size={16}/> Show in Finder</button>
        <button onClick={()=>{previewNative(context.entry!);setContext(null)}}><Info size={16}/> Quick Look <span>Space</span></button>
        <hr/><button onClick={()=>copyToClipboard(false,context.entry)}><Copy size={16}/> Copy <span>⌘C</span></button>
        <button onClick={()=>copyToClipboard(true,context.entry)}><Scissors size={16}/> Cut <span>⌘X</span></button>
        <button onClick={()=>{ask('rename',context.entry)}}><Pencil size={16}/> Rename <span>F2</span></button>
        <button onClick={()=>{void duplicate(context.entry);setContext(null)}}><Copy size={16}/> Duplicate <span>⌘D</span></button>
        {context.entry.isDir&&<button onClick={()=>togglePin(context.entry!.path)}><Pin size={16}/> {pins.includes(context.entry.path)?'Unpin':'Pin to Quick access'}</button>}
        <hr/><button className="danger" onClick={()=>ask('trash',context.entry)}><Trash2 size={16}/> Move to Trash</button>
      </>:<><button onClick={()=>ask('new')}><FolderPlus size={16}/> New folder</button><button disabled={!clipboard} onClick={()=>{void paste();setContext(null)}}><Clipboard size={16}/> Paste</button><hr/><button onClick={()=>{refresh();setContext(null)}}><RefreshCw size={16}/> Refresh</button></>}
    </div>}
    {modal&&<div className="dialog-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(null)}}><form className="dialog" onSubmit={e=>{void commitModal(e)}}>
      <div className={`dialog-icon ${modal.type==='trash'?'warning':''}`}>{modal.type==='new'?<FolderPlus size={23}/>:modal.type==='rename'?<Pencil size={23}/>:<Trash2 size={23}/>}</div>
      <h2>{modal.type==='new'?'Create a new folder':modal.type==='rename'?'Rename item':'Move to Trash?'}</h2>
      <p>{modal.type==='new'?'Give your new folder a name.':modal.type==='rename'?'Enter a new name for this file or folder.':`Move ${modal.target?'“'+modal.target.name+'”':chosen.length+' selected items'} to macOS Trash? You can restore items from Trash later.`}</p>
      {modal.type!=='trash'&&<input autoFocus value={modalText} onChange={e=>setModalText(e.target.value)} onFocus={e=>e.currentTarget.select()} spellCheck={false} placeholder="Name" required/>}
      <div className="dialog-buttons"><button type="button" onClick={()=>setModal(null)}>Cancel</button><button type="submit" className={modal.type==='trash'?'destructive':'primary'} disabled={busy||(modal.type!=='trash'&&!modalText.trim())}>{busy?'Working…':modal.type==='new'?'Create folder':modal.type==='rename'?'Save changes':'Move to Trash'}</button></div>
    </form></div>}
    {toasts.length>0&&<div className="toast-stack">{toasts.map(t=><div key={t.id} className={`toast ${t.error?'error':''}`}><span className="toast-icon">{t.error?'!':<Check size={14}/>}</span><span>{t.message}</span><button onClick={()=>setToasts(old=>old.filter(x=>x.id!==t.id))}><X size={14}/></button></div>)}</div>}
  </div>
}
