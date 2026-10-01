import Link from "next/link";


export default function Dashboard(){


return (

<div className="
p-5
">


<h1 className="
text-2xl
font-bold
">

Hello Doctor

</h1>



<div className="
grid
gap-4
mt-6
">


<div className="
border
rounded-xl
p-5
">

Pending Upload

<p className="text-3xl">
0
</p>

</div>



<div className="
border
rounded-xl
p-5
">

Today's Analysis

<p className="text-3xl">
0
</p>

</div>


</div>



<Link

href="/capture"

className="
block
mt-8
bg-blue-600
text-white
text-center
p-4
rounded-xl
"

>

Capture Image

</Link>



</div>

)

}