// Copyright 2021 Maven Coalition
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
// THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

// This script is intended to be run on a GitHub-hosted runner
// so it has no npm dependencies (which would need to be checked in)
// and it can only use the programs in this list:
// https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners#supported-software
// https://github.com/actions/virtual-environments/blob/main/images/linux/Ubuntu2004-README.md
// It also works on Mac OSX with docker and git installed.

import * as fs from "fs/promises"
import * as path from "path"
import { promisify } from "util"
import { exec, execFile } from "child_process"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const versionFilename = "version.json"
const execPromise = promisify(exec)
const execFilePromise = promisify(execFile)
const githubOwnerAndRepo = "aerospike/aerospike-tools.docker"
const dockerHubRepo = "aerospike/aerospike-tools"
const directoryInContainer = "opt/aerospike"
const destinationRoot = path.resolve(__dirname, "..")
const doNotOverwriteFiles = ["README.md"]
const filenamesToCopyRegardlessOfLicense = ["requirements.txt"]


/**
 * True if the relative path should be copied
 * from the docker image to the destination repo directory
 *
 * False for dotfiles, README, version.json
 * which should never be copied from the docker image
 * to this repository
 * @param {string} path
 * @returns {boolean}
 */
const canOverwritePath = path =>
  // don't overwrite this script's dir which starts with .
  !path.startsWith(".") &&
  // don't overwrite README.md
  doNotOverwriteFiles.indexOf(path) === -1 &&
  path !== versionFilename

/**
 * @typedef {object} VersionFile
 * @property {!string} version
 * @property {!string} sha
 */
/**
 * @param {!string} str
 * @param {!string} prefix
 * @returns {!string}
 */
const removePrefix = (str, prefix) =>
  str.startsWith(prefix) ? str.substr(prefix.length) : str

/**
 * @returns Promise<!VersionFile>
 */
 const loadVersionFile = async () => {
  const versionPath = path.join(destinationRoot, versionFilename)
  /** @type {VersionFile | undefined} */
  let versionFile
  try {
    versionFile = JSON.parse(await fs.readFile(versionPath, {encoding: "utf8"}))
  } catch (e) {
    if (e.code === "ENOENT") {
      versionFile = undefined
    } else {
      throw e
    }
  }
  return versionFile
}
/**
 * @param {VersionFile} versionFile
 * @returns Promise<void>
 */
const saveVersionFile = async (versionFile) => {
  const versionPath = path.join(destinationRoot, versionFilename)
  await fs.writeFile(versionPath, JSON.stringify(versionFile) + "\n")
}

/**
 *
 * @param {!string} a
 * @param {!string} b
 * @returns {number}
 */
const compareVersions = (a, b) => {
  const asplits = a.split(".").reverse()
  const bsplits = b.split(".").reverse()
  const parseNumPart = part => {
    const [, numPrefix, rest] = /(\d*)(.*)/.exec(part)
    const num = numPrefix !== "" ? parseInt(numPrefix) : undefined
    return [num, rest]
  }
  while (asplits.length > 0 && bsplits.length > 0) {
    const apart = asplits.pop(), bpart = bsplits.pop()
    const [anum, arest] = parseNumPart(apart)
    const [bnum, brest] = parseNumPart(bpart)
    const cmp = anum < bnum ? -1 : anum > bnum ? 1 :
      arest < brest ? -1 : arest > brest ? 1 : 0
    if (cmp !== 0) return cmp
  }
  return asplits.length - bsplits.length
}

// a simplified version of mkdirp to avoid dependencies
async function mkdirp(p) {
  p = path.normalize(p)
  const toMkdir = []
  let ancestor = p
  while (ancestor !== "") {
    try {
      await fs.stat(ancestor)
      break
    } catch (e) {
      if (e.code === "ENOENT") {
        toMkdir.push(ancestor)
        ancestor = path.dirname(ancestor)
      } else {
        throw e
      }
    }
  }
  while (toMkdir.length > 0) {
    const p = toMkdir.pop()
    await fs.mkdir(p)
  }
}

// a simplified version of rimraf to avoid dependencies
async function rimraf(p) {
  const stack = [p]
  while (stack.length > 0) {
    const p = stack.pop()
    try {
      if ((await fs.stat(p)).isDirectory()) {
        const children = await fs.readdir(p)
        if (children.length === 0) {
          // console.info('rmdir',p)
          await fs.rmdir(p)
        } else {
          stack.push(p)
          for (const child of children) {
            stack.push(path.join(p, child))
          }
        }
      } else {
        // console.info('unlink',p)
        await fs.unlink(p)
      }
    } catch (e) {
      if (e.code === "ENOENT") {
        // no problem
      } else {
        throw e
      }
    }
  }
}

const openSourcePhrases = {
  BSD0: ["Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted"],
  BSD: ["Redistribution and use in source and binary forms, with or without modification, are permitted"],
  PreviousBSD: ["Redistribution and use in source and binary forms are permitted"],
  MIT: ["to deal in the Software without restriction"],
  Apache2: [
    "Licensed under the Apache License",
    "grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce"
  ],
}

/**
 * @param {!string} p
 * @returns Promise<string | undefined>
 */
const readLicense = async p => {
  const fileHandle = await fs.open(p, "r")
  try {
    const buf = new Uint8Array(2048)
    const {bytesRead} = await fileHandle.read({buffer: buf})
    const bodyString = Buffer.from(buf, 0, bytesRead).toString("utf8")
      .replace(/#|\/\//g, " ") // remove the comment character
      .replace(/\s+/g, " ")
      .toLowerCase()
    for (const [name, phrases] of Object.entries(openSourcePhrases)) {
      for (const phrase of phrases) {
        const lowerCasePhrase = phrase.toLowerCase()
        if (bodyString.indexOf(lowerCasePhrase) !== -1) {
          return name
        }
      }
    }
    return undefined
  } finally {
    await fileHandle.close()
  }
}

/**
 * Copy those files that have an open-source header
 * and copy them to the root of this git repository
 *
 * Excludes paths that are dotfiles, version.json, README
 * @param {!string} source
 * @param {!string} destination
 * @returns {Promise<!string[]>}
 */
async function* copyOpenSourceFiles(source, destination) {
  /**
   * @param {string | undefined} p
   */
  async function* helper(p) {
    if (p !== undefined && !canOverwritePath(p)) {
      return
    }
    const sourceResolved = p === undefined ? source : path.join(source, p)
    const destResolved = p === undefined ? destination : path.join(destination, p)
    const stat = await fs.stat(sourceResolved)
    if (stat.isDirectory()) {
      for (const child of await fs.readdir(sourceResolved)) {
        const childPath = p === undefined ? child : path.join(p, child)
        for await (const item of helper(childPath)) {
          yield item
        }
      }
    } else if (stat.isFile()) {
      const basename = path.basename(p)
      const licenseName = await readLicense(sourceResolved)
      let shouldCopy = false
      if (licenseName !== undefined) {
        console.info(`${sourceResolved} seems to be ${licenseName}; copying it to ${destResolved}`)
        shouldCopy = true
      } else if (filenamesToCopyRegardlessOfLicense.includes(basename)) {
        console.info(`${sourceResolved} filename is whitelisted; copying it to ${destResolved}`)
        shouldCopy = true
      }
      if (shouldCopy) {
        await mkdirp(path.dirname(destResolved))
        await fs.copyFile(sourceResolved, destResolved)
        yield p
      } else {
        console.info(`no detected free license: ${sourceResolved}`)
      }
    }
  }
  for await (const item of helper(undefined)) {
    yield item
  }
}

/**
 * Git rm files that aren't in the whitelist
 * or dotfiles, version.json, and README.
 *
 * If any files were unexpectedly modified, then git rm
 * will fail and the returned Promise will be rejected
 * @param {!string[]} whitelist
 * @returns {Promise<!string[]>}
 */
const gitRmFilesExcluding = async (whitelist) => {
  const whitelistSet = new Set(whitelist)
  // -z: nul-terminate paths
  const {stdout} = await execFilePromise("git", ["ls-tree", "-r", "-z", "HEAD"], {cwd: destinationRoot})
  const pathsToDelete = stdout
    .trim().split("\0")
    .map(line => /[^ ]+ \w+ \w+\t([^\0]+)/.exec(line)?.[1])
    .filter(path => path !== undefined)
    .filter(path => canOverwritePath(path))
    .filter(path => !whitelistSet.has(path))
  if (pathsToDelete.length > 0) {
    await execFilePromise("git", ["rm", "--", ...pathsToDelete], {cwd: destinationRoot})
  }
  return pathsToDelete
}
/**
 * @param {!string[]} files
 * @return {Promise<void>}
 */
const gitAddFiles = async (files) => {
  await execFilePromise("git", ["add", "--", ...files], {cwd: destinationRoot})
}
/**
 * Create a commit, but only if one of the listed files changed.
 *
 * All files to commit must have been git added beforehand.
 * If only files outside the list have changed (e.g. version.json),
 * then no commit is created.
 * @param {object} obj
 * @param {!string} obj.message
 * @param {!string[]} obj.ifFilesChanged
 * @param {!string} obj.createdDate
 */
const gitCommitIfFilesChanged = async ({message, ifFilesChanged, createdDate}) => {
  if (ifFilesChanged.length === 0) {
    // don't run git status with no files; just return
    return
  }
  // --untracked-files: ignore untracked files
  // -z: nul-terminate paths
  // --porcelain=v1: deterministic short output format
  const {stdout} = await execFilePromise("git", ["status", "--untracked-files", "--porcelain=v1", "-z", "--", ...ifFilesChanged], {cwd: destinationRoot})
  if (stdout.trim().length > 0) {
    console.info(`git commit --date ${createdDate} -m ${message}`)
    await execFilePromise("git", ["commit", "--date", createdDate, "-m", message], {cwd: destinationRoot})
  } else {
    console.info(`No changes (other than ${versionFilename}); not creating commit for ${message}`)
  }
}

/**
 * @typedef {object} DockerHubTags
 * @property {string} layer
 * @property {string} name
 */
/**
 * @returns {Promise<DockerHubTags[]>}
 */
const dockerHubListVersions = async () => {
  const hubResponse = JSON.parse((await execFilePromise("wget",
    [
      "-q",
      `https://registry.hub.docker.com/v1/repositories/${dockerHubRepo}/tags`,
      "-O",
      "-"
    ])).stdout)
  return hubResponse
}
/**
 * @param {!string} dockerRepo
 * @param {!string} dockerTag
 * @returns {Promise<string>}
 */
const dockerPull = async (dockerRepo, dockerTag) => {
  const image = `${dockerRepo}:${dockerTag}`
  console.info(`docker pull ${image}`)
  const {stdout} = await execFilePromise("docker", ["pull", "--quiet", image])
  const fullImageTag = stdout.trim()
  return fullImageTag
}

/**
 * @typedef {object} DockerInspectItem
 * @property {!string} Id
 * @property {!string} Created
 * ... more fields
 */
/**
 * @param {!string} fullImageTag
 * @returns {!Promise<!DockerInspectItem[]>}
 */
const dockerInspect = async fullImageTag => {
  const inspectResult = JSON.parse((await execFilePromise("docker", ["inspect", fullImageTag])).stdout)
  return inspectResult
}
/**
 * @param {string} image
 * @returns {Promies<!string>}
 */
const dockerCreateContainer = async image => {
  let {stdout: containerId} = await execFilePromise("docker", ["create", image])
  containerId = containerId.trim() // remove trailing \n
  return containerId
}

const downloadAndCreateCommit = async (version) => {
  const fullImageTag = await dockerPull(dockerHubRepo, version)
  console.info(fullImageTag)
  const inspectResult = await dockerInspect(fullImageTag)
  const sha = removePrefix(inspectResult[0].Id, "sha256:")
  const createdDate = inspectResult[0].Created

  /** @type {VersionFile} */
  const versionFile = {version, sha}
  console.info("Downloaded", fullImageTag, JSON.stringify(versionFile))
  const containerId = await dockerCreateContainer(`sha256:${sha}`)
  console.info(`docker create sha256:${sha} -> ${containerId}`)

  const targetDir = "target"
  await rimraf(targetDir)
  fs.mkdir(targetDir)
  // Both GNU and BSD tar support hyphen flags and -C even though it is not POSIX
  await execPromise(`docker export ${containerId} | tar -x -f- -C ${targetDir} ${directoryInContainer}`)
  console.info(`docker rm ${containerId}`, await execFilePromise("docker", ["rm", containerId]).stderr)

  const copiedFiles = []
  for await (const item of copyOpenSourceFiles(path.join(targetDir, directoryInContainer), path.join(__dirname, ".."))) {
    copiedFiles.push(item)
  }
  await saveVersionFile(versionFile)
  await gitAddFiles([versionFilename, ...copiedFiles])
  const removedFiles = await gitRmFilesExcluding(copiedFiles)
  await gitCommitIfFilesChanged({message: version, ifFilesChanged: [...copiedFiles, ...removedFiles], createdDate})
  // reset the version file in case we didn't create a commit
  await execFilePromise("git", ["checkout", "--", versionFilename], {cwd: destinationRoot})
}

/**
 * @typedef {object} CommandLineOptionsResult
 * @property {!number} `max-count`
 */
const commandLineOptions = {
  // keys here must not contain special regex characters
  ["max-count"]: {type: "number", default: undefined},
}
const usage = () => {
  return "Usage: node download-changes-and-create-commits.mjs <OPTIONS>\nOptions:\n" +
    Object.entries(commandLineOptions)
      .map(([key,]) =>
        `  [--${key} ${key.toUpperCase().replace("-","_")}]`
      )
      .join("\n")
}
/**
 * sort of a poor-man's yargs
 * @param {string[]} args
 * @returns {CommandLineOptionsResult}
 */
const processOptions = (args) => {
  const result = {}
  for (const [name, config] of Object.entries(commandLineOptions)) {
    result[name] = config.default
  }
  flagLoop: for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === "--help") {
      console.log(usage())
      process.exit(0)
    }
    for (const [name, config] of Object.entries(commandLineOptions)) {
      const match = new RegExp(`--${name}(?:=(.*))?`).exec(arg)
      if (!match)
        continue
      const val = match[1] !== undefined ? match[1] : i + 1 < args.length ? args[++i] : undefined
      if (val === undefined) {
        console.error(`Expected value for ${arg}`)
        console.log(usage())
        process.exit(1)
      }
      const castValue = config.type === "number" ? parseFloat(val) : val
      result[name] = castValue
      console.log("found ",name,castValue)
      continue flagLoop
    }
    console.error(`Unknown flag ${arg}`)
    console.log(usage())
    process.exit(1)
  }
  return result
}

async function mainPromise() {
  const options = processOptions(process.argv.slice(2))
  const mostRecentVersion = await loadVersionFile()
  console.info("mostRecentVersion", mostRecentVersion)
  const hubResponse = await dockerHubListVersions()
  const versions = hubResponse
    .map(x => x.name)
    .filter(x => x !== "latest")
    .filter(x => mostRecentVersion === undefined || compareVersions(x, mostRecentVersion.version) > 0)
    .sort(compareVersions)
  const earliestVersions = versions.slice(0, options["max-count"])
  console.info("versions to download", earliestVersions)

  for (const version of earliestVersions) {
    await downloadAndCreateCommit(version)
  }
}

function main() {
  mainPromise().then(() => {}, err => {
    console.info("got error", err)
    process.exit(1)
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main()
}
