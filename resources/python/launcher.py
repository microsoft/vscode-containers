# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License. See LICENSE.md in the project root for license information.

# This acts as a simple launcher for debugpy that only redirects the args to the actual launcher inside the container
import os, sys

internalHostname = sys.argv[-3] # Internal hostname is the third-to-last arg
containerExePath = sys.argv[-2] # Container EXE path is the second-to-last arg
containerId = sys.argv[-1] # Container id is the last arg
args = sys.argv[1:-3] # The remaining args will be given to the launcher

# If the adapterHost is only a port number, then prepend the internal hostname
adapterHost = args[0]

if adapterHost.isnumeric():
    args[0] = internalHostname + ':' + adapterHost

dockerExecArgs = [containerExePath, 'exec', '-d', containerId, 'python3', '/debugpy/launcher'] + args

command = ' '.join(dockerExecArgs)

print(command)
os.system(command)
