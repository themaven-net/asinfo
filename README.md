# aerospike-tools subset

This is a copy of the free/open source commands from the `aerospike/aerospike-tools` docker image
(see [Aerospike: Tools and Utilities](https://docs.aerospike.com/docs/tools/index.html),
[DockerHub: aerospike/aerospike-tools](https://hub.docker.com/r/aerospike/aerospike-tools),
[GitHub: aerospike/aerospike-tools.docker](https://github.com/aerospike/aerospike-tools.docker)).

The tools in this repo include `asinfo`, `asloglatency`, `asmonitor`
that have a redistributable copyright header (specifically MIT license).

Aerospike publishes these tools but does not have
a public source code repository for them.

The commits in this repository are backdated to the creation date
of the `aerospike/aerospike-tools` docker image
from which they were extracted
so that the git log will show the date when changes were made.

This repo does **not** contain other programs from aerospike-tools
that do not have a redistributable copyright header
(`aql`, `asvalidation`, `asbenchmark`, `asloader`, `asadm`).
The source for `asadm` can be found at
[aerospike/aerospike-admin](https://github.com/aerospike/aerospike-admin).

The code from Maven Coalition is licensed under the
[MIT No Attribution License (MIT-0)](https://opensource.org/licenses/MIT-0)
