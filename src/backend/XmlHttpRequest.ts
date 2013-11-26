import file_system = require('../core/file_system');
import file_index = require('../generic/file_index');
import buffer = require('../core/buffer');
import api_error = require('../core/api_error');
import file_flag = require('../core/file_flag');
import util = require('../core/util');
import file = require('../core/file');
import node_fs_stats = require('../core/node_fs_stats');
import preload_file = require('../generic/preload_file');
import browserfs = require('../core/browserfs');
import xhr = require('../generic/xhr');

var Buffer = buffer.Buffer;
var ApiError = api_error.ApiError;
var ErrorCode = api_error.ErrorCode;
var FileFlag = file_flag.FileFlag;
var ActionType = file_flag.ActionType;

/**
 * A simple filesystem backed by XmlHttpRequests.
 */
export class XmlHttpRequest extends file_system.BaseFileSystem implements file_system.FileSystem {
  private _index: file_index.FileIndex;
  public prefix_url: string;
  /**
   * Constructs the file system.
   * @param [String] listing_url The path to the JSON file index generated by
   *   tools/XHRIndexer.coffee. This can be relative to the current webpage URL
   *   or absolutely specified.
   * @param [String] prefix_url The url prefix to use for all web-server requests.
   */
  constructor(listing_url: string, prefix_url: string) {
    super();
    if (listing_url == null) {
      listing_url = 'index.json';
    }
    this.prefix_url = prefix_url != null ? prefix_url : '';
    var listing = this._requestFileSync(listing_url, 'json');
    if (listing == null) {
      throw new Error("Unable to find listing at URL: " + listing_url);
    }
    this._index = file_index.FileIndex.from_listing(listing);
  }

  public empty(): void {
    var idx = this._index._index;
    for (var k in idx) {
      var v = <node_fs_stats.Stats> idx[k];
      if (v.file_data != null) {
        v.file_data = null;
      }
    }
  }

  /**
   * Only requests the HEAD content, for the file size.
   */
  public _requestFileSizeAsync(path: string, cb: (err: api_error.ApiError, size?: number) => void): void {
    xhr.getFileSizeAsync(this.prefix_url + path, cb);
  }
  public _requestFileSizeSync(path: string): number {
    return xhr.getFileSizeSync(this.prefix_url + path);
  }

  /**
   * Asynchronously download the given file.
   */
  private _requestFileAsync(p: string, type: 'buffer', cb: (err: api_error.ApiError, data?: NodeBuffer) => void): void;
  private _requestFileAsync(p: string, type: 'json', cb: (err: api_error.ApiError, data?: any) => void): void;
  private _requestFileAsync(p: string, type: string, cb: (err: api_error.ApiError, data?: any) => void): void;
  private _requestFileAsync(p: string, type: string, cb: (err: api_error.ApiError, data?: any) => void): void {
    xhr.asyncDownloadFile(this.prefix_url + p, type, cb);
  }

  /**
   * Synchronously download the given file.
   */
  private _requestFileSync(p: string, type: 'buffer'): NodeBuffer;
  private _requestFileSync(p: string, type: 'json'): any;
  private _requestFileSync(p: string, type: string): any;
  private _requestFileSync(p: string, type: string): any {
    return xhr.syncDownloadFile(this.prefix_url + p, type);
  }

  public getName(): string {
    return 'XmlHttpRequest';
  }

  public static isAvailable(): boolean {
    // @todo Older browsers use a different name for XHR, iirc.
    return typeof XMLHttpRequest !== "undefined" && XMLHttpRequest !== null;
  }

  public diskSpace(path: string, cb: (total: number, free: number) => void): void {
    // Read-only file system. We could calculate the total space, but that's not
    // important right now.
    cb(0, 0);
  }

  public isReadOnly(): boolean {
    return true;
  }

  public supportsLinks(): boolean {
    return false;
  }

  public supportsProps(): boolean {
    return false;
  }

  public supportsSynch(): boolean {
    return true;
  }

  /**
   * Special XHR function: Preload the given file into the index.
   * @param [String] path
   * @param [BrowserFS.Buffer] buffer
   */
  public preloadFile(path: string, buffer: NodeBuffer): void {
    var inode = <node_fs_stats.Stats> this._index.getInode(path);
    if (inode === null) {
      throw new ApiError(ErrorCode.ENOENT, "" + path + " not found.");
    }
    inode.size = buffer.length;
    inode.file_data = new preload_file.NoSyncFile(this, path, FileFlag.getFileFlag('r'), inode, buffer);
  }

  public stat(path: string, isLstat: boolean, cb: (e: api_error.ApiError, stat?: node_fs_stats.Stats) => void): void {
    var inode = this._index.getInode(path);
    if (inode === null) {
      return cb(new ApiError(ErrorCode.ENOENT, "" + path + " not found."));
    }
    var stats: node_fs_stats.Stats;
    if (inode.isFile()) {
      stats = <node_fs_stats.Stats> inode;
      // At this point, a non-opened file will still have default stats from the listing.
      if (stats.size < 0) {
        this._requestFileSizeAsync(path, function(e: api_error.ApiError, size?: number) {
          if (e) {
            return cb(e);
          }
          stats.size = size;
          cb(null, stats);
        });
      } else {
        cb(null, stats);
      }
    } else {
      stats = (<file_index.DirInode> inode).getStats();
      cb(null, stats);
    }
  }

  public statSync(path: string, isLstat: boolean): node_fs_stats.Stats {
    var inode = this._index.getInode(path);
    if (inode === null) {
      throw new ApiError(ErrorCode.ENOENT, "" + path + " not found.");
    }
    var stats: node_fs_stats.Stats;
    if (inode.isFile()) {
      stats = <node_fs_stats.Stats> inode;
      // At this point, a non-opened file will still have default stats from the listing.
      if (stats.size < 0) {
        stats.size = this._requestFileSizeSync(path);
      }
    } else {
      stats = (<file_index.DirInode> inode).getStats();
    }
    return stats;
  }

  public open(path: string, flags: file_flag.FileFlag, mode: number, cb: (e: api_error.ApiError, file?: file.File) => void): void {
    var _this = this;
    // Check if the path exists, and is a file.
    var inode = <node_fs_stats.Stats> this._index.getInode(path);
    if (inode === null) {
      return cb(new ApiError(ErrorCode.ENOENT, "" + path + " is not in the FileIndex."));
    }
    if (inode.isDirectory()) {
      return cb(new ApiError(ErrorCode.EISDIR, "" + path + " is a directory."));
    }
    switch (flags.pathExistsAction()) {
      case ActionType.THROW_EXCEPTION:
      case ActionType.TRUNCATE_FILE:
        return cb(new ApiError(ErrorCode.EEXIST, "" + path + " already exists."));
      case ActionType.NOP:
        // Use existing file contents.
        // XXX: Uh, this maintains the previously-used flag.
        if (inode.file_data != null) {
          return cb(null, inode.file_data);
        }
        // @todo be lazier about actually requesting the file
        this._requestFileAsync(path, 'buffer', function(err: api_error.ApiError, buffer?: NodeBuffer) {
          if (err) {
            return cb(err);
          }
          // we don't initially have file sizes
          inode.size = buffer.length;
          inode.file_data = new preload_file.NoSyncFile(_this, path, flags, inode, buffer);
          return cb(null, inode.file_data);
        });
        break;
      default:
        return cb(new ApiError(ErrorCode.EINVAL, 'Invalid FileMode object.'));
    }
  }

  public openSync(path: string, flags: file_flag.FileFlag, mode: number): file.File {
    // Check if the path exists, and is a file.
    var inode = <node_fs_stats.Stats> this._index.getInode(path);
    if (inode === null) {
      throw new ApiError(ErrorCode.ENOENT, "" + path + " is not in the FileIndex.");
    }
    if (inode.isDirectory()) {
      throw new ApiError(ErrorCode.EISDIR, "" + path + " is a directory.");
    }
    switch (flags.pathExistsAction()) {
      case ActionType.THROW_EXCEPTION:
      case ActionType.TRUNCATE_FILE:
        throw new ApiError(ErrorCode.EEXIST, "" + path + " already exists.");
      case ActionType.NOP:
        // Use existing file contents.
        // XXX: Uh, this maintains the previously-used flag.
        if (inode.file_data != null) {
          return inode.file_data;
        }
        // @todo be lazier about actually requesting the file
        var buffer = this._requestFileSync(path, 'buffer');
        // we don't initially have file sizes
        inode.size = buffer.length;
        inode.file_data = new preload_file.NoSyncFile(this, path, flags, inode, buffer);
        return inode.file_data;
      default:
        throw new ApiError(ErrorCode.EINVAL, 'Invalid FileMode object.');
    }
  }

  public readdir(path: string, cb: (e: api_error.ApiError, listing?: string[]) => void): void {
    try {
      cb(null, this.readdirSync(path));
    } catch (e) {
      cb(e);
    }
  }

  public readdirSync(path: string): string[] {
    // Check if it exists.
    var inode = this._index.getInode(path);
    if (inode === null) {
      throw new ApiError(ErrorCode.ENOENT, "" + path + " not found.");
    } else if (inode.isFile()) {
      throw new ApiError(ErrorCode.ENOTDIR, "" + path + " is a file, not a directory.");
    }
    return (<file_index.DirInode> inode).getListing();
  }
}

browserfs.registerFileSystem('XmlHttpRequest', XmlHttpRequest);
