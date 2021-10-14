

// import heapdump from 'heapdump';

export const dump = dapp => (req, res): void => {
  try {
    // Removing for now since heapdump is not available in all environments.
    // This may be able to be replaced with the latest node native implementations.

    // https://github.com/bnoordhuis/node-heapdump/issues/115
    // https://nodejs.org/docs/latest/api/inspector.html
    // It's the HeapProfiler.takeHeapSnapshot RPC method, you call it with session.post().

    // const D = new Date();
    // const dateString =
    //   D.getDate() +
    //   '_' +
    //   (D.getMonth() + 1) +
    //   '_' +
    //   D.getFullYear() +
    //   '_' +
    //   D.getHours() +
    //   '_' +
    //   D.getMinutes();
    // // 16-5-2015 9:50
    // heapdump.writeSnapshot(
    //   `${process.env.BASE_DIR}/logs/ ` + dateString + '.heapsnapshot',
    //   (error, filename) => {
    //     if (error) {
    //       console.log(error);
    //       res.json({error});
    //     } else {
    //       console.log('dump written to', filename);
    //       res.json({success: 'Dump was written to ' + filename});
    //     }
    //   }
    // );
  } catch (error) {
    dapp.log(error)
    res.json({ error })
  }
};
