# aerospike-tools subset

This is a copy of a free/open source command `asloglatency` from the `aerospike/aerospike-tools` docker image
(see [Aerospike Tools](https://aerospike.com/docs/tools/index.html),
[DockerHub: aerospike/aerospike-tools](https://hub.docker.com/r/aerospike/aerospike-tools),
[GitHub: aerospike/aerospike-tools.docker](https://github.com/aerospike/aerospike-tools.docker)).
Aerospike publishes this tool but does not have
a public source code repository for it.

The commits in this repository are backdated to the creation date
of the `aerospike/aerospike-tools` docker image
from which it was extracted
so that the git log will show the date when changes were made.

Here is a list of tools from the `aerospike/aerospike-tools` docker image
and where you can get them (other than https://aerospike.com/download/tools/):

* `asloglatency` is in this repo [bin/asloglatency](./bin/asloglatency)
* `asadm` source code is at https://github.com/aerospike/aerospike-admin
* `asinfo` was here, but moved to https://github.com/aerospike/aerospike-admin starting in aerospike-tools 7.2.1
(asadm [2.8.0](https://github.com/aerospike/aerospike-admin/blob/2.8.0/asinfo/asinfo.py)).
* `asbackup`, `asrestore` source code is at https://github.com/aerospike/aerospike-tools-backup
* `asbench` source code is at https://github.com/aerospike/aerospike-benchmark
* `asconfig` source code is at https://github.com/aerospike/asconfig
* `aql` source code is at https://github.com/aerospike/aql
* `uda` not redistributable as far as I know

The scripts in [.github](./.github/workflows/main.yml)
and [.download-changes](.download-changes/download-changes-and-create-commits.mjs)
are licensed under the
[MIT No Attribution License (MIT-0)](https://opensource.org/licenses/MIT-0)
