/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Commands run in a container, and who ran them.
//
// Deliberately its own screen rather than a tab inside the terminal. Sharing a
// container with the terminal broke it: the tab strip took height the
// terminal's own sizing did not account for, and `fit()` ran while the terminal
// was hidden, so the PTY was told the wrong dimensions and full-screen programs
// like `top` drew corrupted. A terminal wants sole ownership of its box.
//
// The agent can execute commands here, which only stays acceptable if the
// person whose container it is can see exactly what ran. So every invocation --
// typed here or issued by the agent -- lands in this list with its argv, exit
// status, duration and full output, and the list is replayed to any panel that
// connects later.

import { Badge, Button, Title3, makeStyles, shorthands } from "@fluentui/react-components";
import { ArrowLeftRegular } from "@fluentui/react-icons";

import { ExecHistory } from "./ExecHistory.jsx";

const useStyles = makeStyles({
    head: { display: "flex", alignItems: "center", columnGap: "8px", ...shorthands.padding("12px", "0", "8px") },
});

export function ExecView({ item, client, entries, onBack, onRan }) {
    const styles = useStyles();
    return (
        <div>
            <div className={styles.head}>
                <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack}>Back</Button>
                <Title3>{item.name ?? item.shortId}</Title3>
                <Badge appearance="filled" color={item.state === "running" ? "success" : "danger"}>{item.state}</Badge>
            </div>
            <ExecHistory item={item} client={client} entries={entries} onRan={onRan} />
        </div>
    );
}
