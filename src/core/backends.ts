import {FileSystemConstructor, BFSCallback, FileSystem} from './file_system';
import {ApiError} from './api_error';
import {checkOptions} from './util';
import {default as AsyncMirror, AsyncMirrorOptions} from '../backend/AsyncMirror';
// import Dropbox from '../backend/Dropbox';
import {default as Emscripten, EmscriptenFileSystemOptions} from '../backend/Emscripten';
// import FolderAdapter from '../backend/FolderAdapter';
// import HTML5FS from '../backend/HTML5FS';
import InMemory from '../backend/InMemory';
import {default as IndexedDB, IndexedDBFileSystemOptions} from '../backend/IndexedDB';
// import LocalStorage from '../backend/LocalStorage';
import {default as MountableFileSystem, MountableFileSystemOptions} from '../backend/MountableFileSystem';
// import OverlayFS from '../backend/OverlayFS';
// import WorkerFS from '../backend/WorkerFS';
// import {default as HTTPRequest, HTTPRequestOptions} from '../backend/HTTPRequest';
// import ZipFS from '../backend/ZipFS';
// import IsoFS from '../backend/IsoFS';

// Monkey-patch `Create` functions to check options before file system initialization.
[AsyncMirror/*, Dropbox*/, Emscripten/*, FolderAdapter, HTML5FS*/, InMemory, IndexedDB/*, IsoFS, LocalStorage*/, MountableFileSystem/*, OverlayFS, WorkerFS, HTTPRequest, ZipFS*/].forEach((fsType: FileSystemConstructor) => {
  const create = fsType.Create;
  fsType.Create = function(opts?: any, cb?: BFSCallback<FileSystem>): void {
    const oneArg = typeof(opts) === "function";
    const normalizedCb = oneArg ? opts : cb;
    const normalizedOpts = oneArg ? {} : opts;

    function wrappedCb(e?: ApiError): void {
      if (e) {
        normalizedCb(e);
      } else {
        create.call(fsType, normalizedOpts, normalizedCb);
      }
    }

    checkOptions(fsType, normalizedOpts, wrappedCb);
  };
});

/**
 * @hidden
 */
// const Backends = { AsyncMirror, Dropbox, Emscripten, FolderAdapter, HTML5FS, InMemory, IndexedDB, IsoFS, LocalStorage, MountableFileSystem, OverlayFS, WorkerFS, HTTPRequest, XmlHttpRequest: HTTPRequest, ZipFS };
// Make sure all backends cast to FileSystemConstructor (for type checking)
// const _: {[name: string]: FileSystemConstructor} = Backends;
// tslint:disable-next-line:no-unused-expression
// _;
// tslint:enable-next-line:no-unused-expression
// export default _;

export {
  FileSystem as Type,
  AsyncMirror,
  AsyncMirrorOptions,
  Emscripten,
  EmscriptenFileSystemOptions,
  InMemory,
  IndexedDB,
  IndexedDBFileSystemOptions,
  MountableFileSystem,
  MountableFileSystemOptions,
};
