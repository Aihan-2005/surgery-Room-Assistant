import CameraView from "@/components/camera/CameraView";


export default function Capture(){


return (

<div className="
p-5
">


<h1 className="
text-xl
font-bold
mb-5
">

Take Image

</h1>



<CameraView />



<button

className="
mt-5
w-full
bg-blue-600
text-white
p-4
rounded-xl
"

>

Capture

</button>


</div>

)

}